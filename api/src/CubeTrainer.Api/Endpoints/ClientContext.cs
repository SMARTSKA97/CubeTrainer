using CubeTrainer.Application.Auth;
using Microsoft.Extensions.Options;

namespace CubeTrainer.Api.Endpoints;

/// <summary>Where the refresh token travels: an HttpOnly cookie for browsers, the JSON body for the Android app.</summary>
internal static class ClientContext
{
    public const string CookieName = "ct_rt";
    public const string CsrfHeader = "X-Requested-With";
    public const string CsrfValue = "CubeTrainer";
    public const string CookiePath = "/api/v1/auth";

    public static ClientInfo Info(this HttpContext ctx) =>
        new(ctx.Connection.RemoteIpAddress?.ToString(), ctx.Request.Headers.UserAgent.ToString());

    public static bool IsNative(this HttpContext ctx) =>
        string.Equals(ctx.Request.Headers["X-Client-Type"], "native", StringComparison.OrdinalIgnoreCase);

    /// <summary>Cookie requests must carry a custom header: a cross-site form post cannot add one (CSRF defence).</summary>
    public static bool HasCsrfHeader(this HttpContext ctx) =>
        string.Equals(ctx.Request.Headers[CsrfHeader], CsrfValue, StringComparison.Ordinal);

    public static string? RefreshTokenFrom(this HttpContext ctx, string? bodyToken) =>
        !string.IsNullOrEmpty(bodyToken) ? bodyToken : ctx.Request.Cookies[CookieName];

    public static void SetRefreshCookie(this HttpContext ctx, string token, DateTimeOffset expires)
    {
        var sameSite = ctx.RequestServices.GetRequiredService<IOptions<CookieSettings>>().Value.SameSite;
        ctx.Response.Cookies.Append(CookieName, token, new CookieOptions
        {
            HttpOnly = true,
            Secure = ctx.Request.IsHttps || ctx.RequestServices.GetRequiredService<IOptions<CookieSettings>>().Value.ForceSecure,
            SameSite = sameSite,
            Path = CookiePath,
            Expires = expires,
            IsEssential = true,
        });
    }

    public static void ClearRefreshCookie(this HttpContext ctx) =>
        ctx.Response.Cookies.Delete(CookieName, new CookieOptions { Path = CookiePath });
}

/// <summary>
/// "Lax" works when the web app and the API share a registrable domain (app.example.com + api.example.com).
/// Set Auth:Cookie:SameSite=None (and serve over https) when they are on different sites (pages.dev + onrender.com).
/// </summary>
public sealed class CookieSettings
{
    public const string Section = "Auth:Cookie";

    public SameSiteMode SameSite { get; set; } = SameSiteMode.Lax;

    public bool ForceSecure { get; set; }
}
