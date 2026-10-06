using CubeTrainer.Api.Contracts;
using CubeTrainer.Api.Hosting;
using CubeTrainer.Application.Cases;
using CubeTrainer.Application.Stats;
using CubeTrainer.Application.Summary;

namespace CubeTrainer.Api.Endpoints;

/// <summary>Read-only aggregates (stats, per-case stats, daily summary) and case learning status.</summary>
internal static class InsightEndpoints
{
    public static void MapInsightEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup(string.Empty).RequireAuthorization();

        // Optional filters: from/to (epoch ms, inclusive), cube, method, stage ("full", "cross", ...).
        g.MapGet("/stats", async (string? mode, string? caseId, long? from, long? to, string? cube, string? method, string? stage, HttpContext ctx, StatsService svc, CancellationToken ct) =>
            (await svc.ComputeAsync(ctx.User.UserId()!.Value, mode, caseId, ct, new StatsFilter(from, to, cube, method, stage))).ToHttp()).WithTags("Stats");

        g.MapGet("/cases/stats", async (HttpContext ctx, StatsService svc, CancellationToken ct) =>
            Results.Ok(await svc.PerCaseAsync(ctx.User.UserId()!.Value, ct))).WithTags("Stats");

        // Daily-practice summary for dashboards. tz = minutes ahead of UTC, e.g. 330 for India.
        g.MapGet("/summary", async (int? tz, HttpContext ctx, SummaryService svc, CancellationToken ct) =>
            Results.Ok(await svc.GetAsync(ctx.User.UserId()!.Value, tz ?? 0, ct))).WithTags("Summary");

        g.MapGet("/cases/status", async (HttpContext ctx, CaseStatusService svc, CancellationToken ct) =>
            Results.Ok(await svc.GetAllAsync(ctx.User.UserId()!.Value, ct))).WithTags("Cases");

        g.MapPut("/cases/{caseId}/status", async (string caseId, StatusUpdate body, HttpContext ctx, CaseStatusService svc, CancellationToken ct) =>
            (await svc.SetAsync(ctx.User.UserId()!.Value, caseId, body.Status, ct)).ToHttp(_ => Results.NoContent())).WithTags("Cases");
    }
}
