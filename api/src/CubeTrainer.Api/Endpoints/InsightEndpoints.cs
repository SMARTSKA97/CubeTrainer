using CubeTrainer.Api.Contracts;
using CubeTrainer.Application.Cases;
using CubeTrainer.Application.Stats;
using CubeTrainer.Application.Summary;

namespace CubeTrainer.Api.Endpoints;

/// <summary>Read-only aggregates (stats, per-case stats, daily summary) and case learning status.</summary>
internal static class InsightEndpoints
{
    public static void MapInsightEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/stats", async (string? mode, string? caseId, StatsService svc, CancellationToken ct) =>
            (await svc.ComputeAsync(mode, caseId, ct)).ToHttp()).WithTags("Stats");

        api.MapGet("/cases/stats", async (StatsService svc, CancellationToken ct) =>
            Results.Ok(await svc.PerCaseAsync(ct))).WithTags("Stats");

        // Daily-practice summary for dashboards. tz = minutes ahead of UTC, e.g. 330 for India.
        api.MapGet("/summary", async (int? tz, SummaryService svc, CancellationToken ct) =>
            Results.Ok(await svc.GetAsync(tz ?? 0, ct))).WithTags("Summary");

        api.MapGet("/cases/status", async (CaseStatusService svc, CancellationToken ct) =>
            Results.Ok(await svc.GetAllAsync(ct))).WithTags("Cases");

        api.MapPut("/cases/{caseId}/status", async (string caseId, StatusUpdate body, CaseStatusService svc, CancellationToken ct) =>
            (await svc.SetAsync(caseId, body.Status, ct)).ToHttp(_ => Results.NoContent())).WithTags("Cases");
    }
}
