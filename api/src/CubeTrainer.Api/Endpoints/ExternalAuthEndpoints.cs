using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CubeTrainer.Api.Hosting;
using CubeTrainer.Application.Auth;
using CubeTrainer.Application.Auth.External;
using CubeTrainer.Infrastructure.External;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Options;

namespace CubeTrainer.Api.Endpoints;

/// <summary>
/// Sign in / sign up / connect with Google, Microsoft, GitHub or Facebook (OAuth code flow + PKCE, handled entirely server side).
/// The browser is only ever redirected; no token or secret reaches page JavaScript. After a successful sign-in the API sets the
/// same HttpOnly refresh cookie as a password login and sends the browser to a web page that exchanges it for an access token.
/// </summary>
internal static class ExternalAuthEndpoints
{
    private const string StateCookie = "ct_oauth";
    private const string StateCookiePath = "/api/v1/auth/external";

    /// <summary>The Android app returns through this URL scheme (declared in its manifest); AppChallenge is set for app-initiated sign-ins.</summary>
    internal const string AppScheme = "cubetrainer";

    private sealed record StatePayload(string Provider, string State, string Verifier, Guid? LinkUserId, string ReturnUrl, DateTimeOffset Expires, string? AppChallenge = null);

    /// <summary>A finished sign-in waiting for the app to collect it. Useless without the verifier whose SHA-256 is Challenge (PKCE).</summary>
    private sealed record AppCodePayload(AuthSession Session, string Challenge, DateTimeOffset Expires);

    public sealed record AppExchangeBody(string? Code, string? Verifier);

    private sealed record LinkPayload(Guid UserId, DateTimeOffset Expires);

    public sealed record ProviderBody(string? Provider);

    public static void MapExternalAuthEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/auth").WithTags("Social login").RequireRateLimiting(ServiceCollectionExtensions.AuthLimiter);

        g.MapGet("/providers", (IOAuthGateway gateway) => Results.Ok(gateway.EnabledProviders));

        g.MapGet("/external/{provider}/start", (string provider, string? returnUrl, string? link, string? challenge, HttpContext ctx, IOAuthGateway gateway, IDataProtectionProvider dp, IOptions<WebOptions> web, TimeProvider clock) =>
        {
            provider = provider.ToLowerInvariant();
            if (!gateway.IsEnabled(provider)) return Results.NotFound();
            if (challenge is not null && (link is not null || !IsChallenge(challenge))) return Results.BadRequest();

            Guid? linkUser = null;
            if (!string.IsNullOrEmpty(link))
            {
                var linkPayload = Unseal<LinkPayload>(dp, "link", link, clock);
                if (linkPayload is null) return ToWeb(web.Value, "/settings", ("linkError", "link_expired"));
                linkUser = linkPayload.UserId;
            }

            var start = gateway.BuildStart(provider, CallbackUrl(ctx, provider));
            var payload = new StatePayload(provider, start.State, start.CodeVerifier, linkUser, SafeReturn(returnUrl), clock.GetUtcNow().AddMinutes(10), challenge);
            ctx.Response.Cookies.Append(StateCookie, Seal(dp, "state", payload), new CookieOptions
            {
                HttpOnly = true,
                Secure = ctx.Request.IsHttps,
                SameSite = SameSiteMode.Lax, // the provider sends the browser back with a top-level GET, which Lax allows
                Path = StateCookiePath,
                MaxAge = TimeSpan.FromMinutes(10),
                IsEssential = true,
            });
            ctx.Response.Headers.CacheControl = "no-store";
            return Results.Redirect(start.AuthorizeUrl);
        });

        g.MapGet("/external/{provider}/callback", async (string provider, string? code, string? state, string? error, HttpContext ctx, IOAuthGateway gateway, ExternalAuthService external, IDataProtectionProvider dp, IOptions<WebOptions> web, TimeProvider clock, CancellationToken ct) =>
        {
            provider = provider.ToLowerInvariant();
            var cookie = ctx.Request.Cookies[StateCookie];
            ctx.Response.Cookies.Delete(StateCookie, new CookieOptions { Path = StateCookiePath });
            ctx.Response.Headers.CacheControl = "no-store";

            var saved = string.IsNullOrEmpty(cookie) ? null : Unseal<StatePayload>(dp, "state", cookie, clock);
            if (saved is null || saved.Provider != provider || string.IsNullOrEmpty(state) ||
                !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(saved.State), Encoding.UTF8.GetBytes(state)))
            {
                return Fail(web.Value, saved?.LinkUserId is not null, "state_mismatch");
            }

            var linking = saved.LinkUserId is not null;
            var app = saved.AppChallenge is not null;
            if (!string.IsNullOrEmpty(error) || string.IsNullOrEmpty(code)) return app ? ToApp("error", ("error", "external_denied")) : Fail(web.Value, linking, "external_denied");

            var profile = await gateway.ExchangeAsync(provider, code, CallbackUrl(ctx, provider), saved.Verifier, ct);
            if (profile is null) return app ? ToApp("error", ("error", "external_failed")) : Fail(web.Value, linking, "external_failed");

            var outcome = await external.SignInAsync(profile, saved.LinkUserId, ctx.Info(), ct);
            if (!outcome.IsSuccess) return app ? ToApp("error", ("error", outcome.Error!.Code)) : Fail(web.Value, linking, outcome.Error!.Code);

            if (app)
            {
                // Hand the result to the app through its URL scheme. No cookie: the app has its own token storage.
                return outcome.Value switch
                {
                    ExternalSignedIn signedIn => ToApp("done", ("code", Seal(dp, "app", new AppCodePayload(signedIn.Session, saved.AppChallenge!, clock.GetUtcNow().AddMinutes(2)))), ("returnUrl", saved.ReturnUrl)),
                    ExternalTwoFactorRequired twoFactor => ToApp("two-factor", ("challenge", twoFactor.Challenge), ("returnUrl", saved.ReturnUrl)),
                    ExternalNeedsProfile needs => ToApp("complete", ("ticket", external.IssueTicket(needs.Profile)), ("returnUrl", saved.ReturnUrl)),
                    _ => ToApp("error", ("error", "external_failed")),
                };
            }

            switch (outcome.Value)
            {
                case ExternalSignedIn signedIn:
                    ctx.SetRefreshCookie(signedIn.Session.RefreshToken, signedIn.Session.RefreshExpiresAt);
                    return ToWeb(web.Value, "/auth/external/done", ("returnUrl", saved.ReturnUrl));
                case ExternalTwoFactorRequired twoFactor:
                    return ToWeb(web.Value, "/auth/two-factor", ("challenge", twoFactor.Challenge), ("returnUrl", saved.ReturnUrl));
                case ExternalLinked linked:
                    return ToWeb(web.Value, "/settings", ("linked", linked.Provider));
                case ExternalNeedsProfile needs:
                    return ToWeb(web.Value, "/auth/external/complete", ("ticket", external.IssueTicket(needs.Profile)), ("returnUrl", saved.ReturnUrl));
                default:
                    return Fail(web.Value, linking, "external_failed");
            }
        });

        // The app trades the one-time code for a normal session. The code is sealed server side and only opens with the secret verifier that never left the app.
        g.MapPost("/external/app-exchange", (AppExchangeBody body, HttpContext ctx, IDataProtectionProvider dp, TimeProvider clock) =>
        {
            var verifier = body.Verifier ?? string.Empty;
            var payload = string.IsNullOrEmpty(body.Code) || verifier.Length == 0 ? null : Unseal<AppCodePayload>(dp, "app", body.Code, clock);
            if (payload is null || !ctx.IsNative() || !CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Challenge(verifier)), Encoding.ASCII.GetBytes(payload.Challenge)))
            {
                return Results.Problem(title: "Bad request", detail: "The sign-in code is invalid or expired.", statusCode: StatusCodes.Status400BadRequest, extensions: new Dictionary<string, object?> { ["code"] = "external_failed" });
            }

            return AuthEndpoints.SessionResponse(ctx, payload.Session);
        });

        g.MapGet("/external/ticket", (string? ticket, ExternalAuthService external) =>
            external.ReadTicket(ticket).ToHttp(p => Results.Ok(new { provider = p.Provider, email = p.Email, emailVerified = p.EmailVerified, name = p.Name })));

        g.MapPost("/external/complete", async (CompleteExternalRequest body, HttpContext ctx, ExternalAuthService external, CancellationToken ct) =>
            (await external.CompleteAsync(body, ctx.Info(), ct)).ToHttp(done =>
                done.Session is { } session ? AuthEndpoints.SessionResponse(ctx, session) : Results.Accepted(value: new { verifyEmail = true })));

        // ---- the signed-in user's connected accounts
        var me = api.MapGroup("/me/identities").WithTags("Account").RequireAuthorization().RequireRateLimiting(ServiceCollectionExtensions.AuthLimiter);

        me.MapGet("/", async (HttpContext ctx, ExternalAuthService external, CancellationToken ct) =>
            (await external.ListAsync(ctx.User.UserId()!.Value, ct)).ToHttp());

        // Returns the URL to send the browser to. It carries a short-lived sealed token saying who is linking, because the
        // browser navigation that follows has no Authorization header.
        me.MapPost("/{provider}/link-start", (string provider, string? returnUrl, HttpContext ctx, IOAuthGateway gateway, IDataProtectionProvider dp, TimeProvider clock) =>
        {
            provider = provider.ToLowerInvariant();
            if (!gateway.IsEnabled(provider)) return Results.NotFound();
            var token = Seal(dp, "link", new LinkPayload(ctx.User.UserId()!.Value, clock.GetUtcNow().AddMinutes(5)));
            var url = $"{ctx.Request.Scheme}://{ctx.Request.Host}/api/v1/auth/external/{provider}/start?link={Uri.EscapeDataString(token)}";
            return Results.Ok(new { url });
        });

        me.MapDelete("/{provider}", async (string provider, HttpContext ctx, ExternalAuthService external, CancellationToken ct) =>
            (await external.UnlinkAsync(ctx.User.UserId()!.Value, provider.ToLowerInvariant(), ct)).ToHttp(_ => Results.NoContent()));
    }

    /// <summary>base64url(SHA-256(verifier)), the PKCE S256 transform.</summary>
    internal static string Challenge(string verifier) =>
        Convert.ToBase64String(SHA256.HashData(Encoding.ASCII.GetBytes(verifier))).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static bool IsChallenge(string s) => s.Length == 43 && s.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');

    private static IResult ToApp(string path, params (string Key, string Value)[] query) =>
        Results.Redirect($"{AppScheme}://auth/{path}?{string.Join('&', query.Select(q => $"{q.Key}={Uri.EscapeDataString(q.Value)}"))}");

    private static string CallbackUrl(HttpContext ctx, string provider)
    {
        var configured = ctx.RequestServices.GetRequiredService<IOptions<ExternalAuthOptions>>().Value.CallbackBaseUrl;
        var root = string.IsNullOrWhiteSpace(configured) ? $"{ctx.Request.Scheme}://{ctx.Request.Host}" : configured.TrimEnd('/');
        return $"{root}/api/v1/auth/external/{provider}/callback";
    }

    private static IResult Fail(WebOptions web, bool linking, string code) =>
        linking ? ToWeb(web, "/settings", ("linkError", code)) : ToWeb(web, "/auth/login", ("error", code));

    private static IResult ToWeb(WebOptions web, string path, params (string Key, string Value)[] query)
    {
        var qs = string.Join('&', query.Select(q => $"{q.Key}={Uri.EscapeDataString(q.Value)}"));
        return Results.Redirect($"{web.BaseUrl.TrimEnd('/')}{path}{(qs.Length > 0 ? "?" + qs : string.Empty)}");
    }

    /// <summary>Only same-site relative paths: stops the sign-in page being used as an open redirect.</summary>
    internal static string SafeReturn(string? url) =>
        !string.IsNullOrEmpty(url) && url.Length <= 200 && url[0] == '/' && !url.StartsWith("//", StringComparison.Ordinal) && !url.Contains('\\') ? url : "/today";

    private static string Seal<T>(IDataProtectionProvider dp, string purpose, T payload) =>
        dp.CreateProtector("CubeTrainer.OAuth." + purpose).Protect(JsonSerializer.Serialize(payload));

    private static T? Unseal<T>(IDataProtectionProvider dp, string purpose, string value, TimeProvider clock) where T : class
    {
        try
        {
            var payload = JsonSerializer.Deserialize<T>(dp.CreateProtector("CubeTrainer.OAuth." + purpose).Unprotect(value));
            var expires = payload switch { StatePayload s => s.Expires, LinkPayload l => l.Expires, AppCodePayload a => a.Expires, _ => DateTimeOffset.MinValue };
            return expires > clock.GetUtcNow() ? payload : null;
        }
        catch (Exception ex) when (ex is CryptographicException or JsonException or FormatException)
        {
            return null;
        }
    }
}
