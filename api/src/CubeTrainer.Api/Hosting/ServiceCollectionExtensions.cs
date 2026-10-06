using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;

namespace CubeTrainer.Api.Hosting;

internal static class ServiceCollectionExtensions
{
    public const string GlobalLimiter = "global";

    /// <summary>Allowed browser origins: <c>Cors:Origins</c> plus the comma separated <c>CORS_ORIGINS</c> variable.</summary>
    public static IServiceCollection AddConfiguredCors(this IServiceCollection services, IConfiguration config)
    {
        var origins = (config.GetSection("Cors:Origins").Get<string[]>() ?? [])
            .Concat((Environment.GetEnvironmentVariable("CORS_ORIGINS") ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Select(o => o.TrimEnd('/'))
            .Distinct()
            .ToArray();

        services.AddCors(o => o.AddDefaultPolicy(p => p
            .WithOrigins(origins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .WithExposedHeaders("Retry-After")));
        return services;
    }

    /// <summary>Per-client fixed window limiter. Auth endpoints will get stricter named policies in Phase 1.</summary>
    public static IServiceCollection AddApiRateLimiting(this IServiceCollection services, IConfiguration config)
    {
        var permit = config.GetValue("RateLimiting:PermitPerMinute", 300);
        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
                ctx.Request.Path.StartsWithSegments("/health")
                    ? RateLimitPartition.GetNoLimiter("health")
                    : RateLimitPartition.GetFixedWindowLimiter(
                        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                        _ => new FixedWindowRateLimiterOptions { PermitLimit = permit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
            o.OnRejected = async (ctx, ct) =>
            {
                if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry))
                    ctx.HttpContext.Response.Headers.RetryAfter = ((int)retry.TotalSeconds).ToString(System.Globalization.CultureInfo.InvariantCulture);
                await Results.Problem(title: "Too many requests", detail: "Slow down and retry shortly.", statusCode: 429)
                    .ExecuteAsync(ctx.HttpContext);
            };
        });
        return services;
    }

    /// <summary>Render/Cloudflare terminate TLS in front of us; only trust their forwarded headers when told to.</summary>
    public static IServiceCollection AddProxyHeaders(this IServiceCollection services, IConfiguration config)
    {
        if (!config.GetValue("Proxy:TrustForwardedHeaders", false)) return services;
        services.Configure<ForwardedHeadersOptions>(o =>
        {
            o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            o.KnownIPNetworks.Clear(); // the platform load balancer's address is not known in advance
            o.KnownProxies.Clear();
        });
        return services;
    }
}
