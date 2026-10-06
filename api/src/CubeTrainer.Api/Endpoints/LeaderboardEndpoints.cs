using CubeTrainer.Api.Hosting;
using CubeTrainer.Application.Leaderboards;

namespace CubeTrainer.Api.Endpoints;

/// <summary>Public boards (opt-in people only) and the signed-in person's own standing.</summary>
internal static class LeaderboardEndpoints
{
    public static void MapLeaderboardEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/leaderboards").WithTags("Leaderboards");

        g.MapGet("/me", async (HttpContext ctx, LeaderboardService svc, CancellationToken ct) =>
            (await svc.MineAsync(ctx.User.UserId()!.Value, ct)).ToHttp()).RequireAuthorization();

        // metric = single | ao5 | ao12; period = all | 30d; optional country (ISO 3166-1 alpha-2) and method (cfop, roux, ...)
        g.MapGet("/{metric}", async (string metric, string? period, string? country, string? method, int? limit, HttpContext ctx, LeaderboardService svc, CancellationToken ct) =>
        {
            ctx.Response.Headers.CacheControl = "no-cache";
            return (await svc.BoardAsync(metric, period, country, method, limit, ct)).ToHttp();
        }).AllowAnonymous();
    }
}
