using CubeTrainer.Application.Auth;
using CubeTrainer.Api.Hosting;
using CubeTrainer.Application.Auth.Identity;
using CubeTrainer.Application.Auth.TwoFactor;
using Microsoft.Extensions.Options;

namespace CubeTrainer.Api.Endpoints;

internal static class AuthEndpoints
{
    public sealed record LoginBody(string? Email, string? Password);

    public sealed record EmailBody(string? Email);

    public sealed record TokenBody(string? Token);

    public sealed record ResetBody(string? Token, string? NewPassword);

    public sealed record RefreshBody(string? RefreshToken);

    public sealed record ChangePasswordBody(string? CurrentPassword, string? NewPassword);

    public sealed record TwoFactorLoginBody(string? Challenge, string? Code);

    public sealed record CodeBody(string? Code);

    public sealed record DisableTwoFactorBody(string? Password, string? Code);

    public sealed record PasswordBody(string? Password, string? ConfirmHandle = null);

    public static void MapAuthEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/auth").WithTags("Auth").RequireRateLimiting(ServiceCollectionExtensions.AuthLimiter);

        // What the sign-up form needs to know, so the web and Android clients never hard-code the rules.
        g.MapGet("/policy", (IOptions<AuthOptions> o) => Results.Ok(new
        {
            minimumAge = o.Value.MinimumAge,
            minPasswordLength = o.Value.MinPasswordLength,
            maxPasswordLength = PersonalDataPasswordValidator.MaxLength,
            termsVersion = o.Value.TermsVersion,
            requireConfirmedEmail = o.Value.RequireConfirmedEmail,
        }));

        g.MapPost("/register", async (RegisterRequest body, AuthService auth, CancellationToken ct) =>
            (await auth.RegisterAsync(body, ct)).ToHttp(_ => Results.Accepted()));

        g.MapGet("/handle-available", async (string? handle, AuthService auth, CancellationToken ct) =>
            (await auth.HandleAvailableAsync(handle, ct)).ToHttp(free => Results.Ok(new { available = free })));

        g.MapPost("/verify-email", async (TokenBody body, AuthService auth, CancellationToken ct) =>
            (await auth.VerifyEmailAsync(body.Token, ct)).ToHttp(_ => Results.NoContent()));

        g.MapPost("/resend-verification", async (EmailBody body, AuthService auth, CancellationToken ct) =>
            (await auth.ResendVerificationAsync(body.Email, ct)).ToHttp(_ => Results.Accepted()));

        g.MapPost("/login", async (LoginBody body, HttpContext ctx, AuthService auth, CancellationToken ct) =>
            (await auth.PasswordSignInAsync(body.Email, body.Password, ctx.Info(), ct)).ToHttp(o =>
                o.Session is { } session ? SessionResponse(ctx, session) : Results.Ok(new { twoFactorRequired = true, challenge = o.Challenge })));

        g.MapPost("/login/2fa", async (TwoFactorLoginBody body, HttpContext ctx, TwoFactorService twoFactor, CancellationToken ct) =>
            (await twoFactor.CompleteSignInAsync(body.Challenge, body.Code, ctx.Info(), ct)).ToHttp(s => SessionResponse(ctx, s)));

        g.MapPost("/refresh", async (RefreshBody? body, HttpContext ctx, AuthService auth, CancellationToken ct) =>
        {
            var token = ctx.RefreshTokenFrom(body?.RefreshToken);
            if (!ctx.IsNative() && string.IsNullOrEmpty(body?.RefreshToken) && !ctx.HasCsrfHeader()) return CsrfRejected();
            return (await auth.RefreshAsync(token, ctx.Info(), ct)).ToHttp(s => SessionResponse(ctx, s));
        });

        g.MapPost("/logout", async (RefreshBody? body, HttpContext ctx, AuthService auth, CancellationToken ct) =>
        {
            if (!ctx.IsNative() && string.IsNullOrEmpty(body?.RefreshToken) && !ctx.HasCsrfHeader()) return CsrfRejected();
            await auth.LogoutAsync(ctx.RefreshTokenFrom(body?.RefreshToken), ct);
            ctx.ClearRefreshCookie();
            return Results.NoContent();
        });

        g.MapPost("/forgot-password", async (EmailBody body, AuthService auth, CancellationToken ct) =>
            (await auth.ForgotPasswordAsync(body.Email, ct)).ToHttp(_ => Results.Accepted()));

        g.MapPost("/reset-password", async (ResetBody body, AuthService auth, CancellationToken ct) =>
            (await auth.ResetPasswordAsync(body.Token, body.NewPassword, ct)).ToHttp(_ => Results.NoContent()));

        // ---- signed-in only
        var me = g.MapGroup(string.Empty).RequireAuthorization();

        me.MapPost("/logout-all", async (HttpContext ctx, AuthService auth, CancellationToken ct) =>
        {
            var result = await auth.LogoutEverywhereAsync(ctx.User.UserId()!.Value, ct);
            ctx.ClearRefreshCookie();
            return result.ToHttp(_ => Results.NoContent());
        });

        var tf = me.MapGroup("/2fa");
        tf.MapGet("/", async (HttpContext ctx, TwoFactorService twoFactor, CancellationToken ct) =>
            (await twoFactor.StatusAsync(ctx.User.UserId()!.Value, ct)).ToHttp(r => Results.Ok(r)));
        tf.MapPost("/setup", async (PasswordBody body, HttpContext ctx, TwoFactorService twoFactor, CancellationToken ct) =>
            (await twoFactor.BeginSetupAsync(ctx.User.UserId()!.Value, body.Password, ct)).ToHttp(r => Results.Ok(r)));
        tf.MapPost("/enable", async (CodeBody body, HttpContext ctx, TwoFactorService twoFactor, CancellationToken ct) =>
            (await twoFactor.EnableAsync(ctx.User.UserId()!.Value, body.Code, ct)).ToHttp(r => Results.Ok(r)));
        tf.MapPost("/disable", async (DisableTwoFactorBody body, HttpContext ctx, TwoFactorService twoFactor, CancellationToken ct) =>
            (await twoFactor.DisableAsync(ctx.User.UserId()!.Value, body.Password, body.Code, ct)).ToHttp(_ => Results.NoContent()));
        tf.MapPost("/recovery-codes", async (CodeBody body, HttpContext ctx, TwoFactorService twoFactor, CancellationToken ct) =>
            (await twoFactor.RegenerateRecoveryCodesAsync(ctx.User.UserId()!.Value, body.Code, ct)).ToHttp(r => Results.Ok(r)));

        me.MapPost("/change-password", async (ChangePasswordBody body, HttpContext ctx, AuthService auth, CancellationToken ct) =>
            (await auth.ChangePasswordAsync(ctx.User.UserId()!.Value, body.CurrentPassword, body.NewPassword, ctx.User.SessionId() ?? Guid.Empty, ct)).ToHttp(_ => Results.NoContent()));
    }

    internal static IResult SessionResponse(HttpContext ctx, AuthSession s)
    {
        ctx.Response.Headers.CacheControl = "no-store";
        if (ctx.IsNative())
        {
            return Results.Ok(new { accessToken = s.Access.Value, expiresAt = s.Access.ExpiresAt, refreshToken = s.RefreshToken, refreshExpiresAt = s.RefreshExpiresAt, user = s.User });
        }

        ctx.SetRefreshCookie(s.RefreshToken, s.RefreshExpiresAt);
        return Results.Ok(new { accessToken = s.Access.Value, expiresAt = s.Access.ExpiresAt, user = s.User });
    }

    private static IResult CsrfRejected() =>
        Results.Problem(title: "Bad request", detail: $"Missing {ClientContext.CsrfHeader} header.", statusCode: StatusCodes.Status400BadRequest, extensions: new Dictionary<string, object?> { ["code"] = "csrf_header_missing" });
}
