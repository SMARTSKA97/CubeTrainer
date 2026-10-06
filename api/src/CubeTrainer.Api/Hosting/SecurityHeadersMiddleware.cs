namespace CubeTrainer.Api.Hosting;

/// <summary>Defence-in-depth headers for an API that only ever returns JSON.</summary>
internal sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext ctx)
    {
        ctx.Response.OnStarting(static state =>
        {
            var h = ((HttpContext)state).Response.Headers;
            h["X-Content-Type-Options"] = "nosniff";
            h["X-Frame-Options"] = "DENY";
            h["Referrer-Policy"] = "no-referrer";
            h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
            h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
            h["Cross-Origin-Resource-Policy"] = "same-site";
            return Task.CompletedTask;
        }, ctx);
        return next(ctx);
    }
}
