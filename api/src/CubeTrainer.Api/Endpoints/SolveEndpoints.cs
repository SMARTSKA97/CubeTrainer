using CubeTrainer.Api.Contracts;
using CubeTrainer.Api.Hosting;
using CubeTrainer.Application.Solves;
using CubeTrainer.Application.Sync;

namespace CubeTrainer.Api.Endpoints;

/// <summary>Everything here needs a signed-in user and only ever sees that user's rows.</summary>
internal static class SolveEndpoints
{
    public static void MapSolveEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/solves").WithTags("Solves").RequireAuthorization();

        g.MapGet("/", async (string? mode, string? caseId, HttpContext ctx, SolveService svc, CancellationToken ct) =>
            (await svc.ListAsync(ctx.User.UserId()!.Value, mode, caseId, ct)).ToHttp(list => Results.Ok(list.Select(SolveDto.From))));

        g.MapPost("/", async (SolveDto solve, HttpContext ctx, SolveService svc, CancellationToken ct) =>
            (await svc.UpsertAsync(ctx.User.UserId()!.Value, [solve.ToDomain()], ct)).ToHttp(_ => Results.Ok(solve)));

        g.MapPost("/bulk", async (List<SolveDto> solves, HttpContext ctx, SolveService svc, CancellationToken ct) =>
            (await svc.UpsertAsync(ctx.User.UserId()!.Value, solves.ConvertAll(s => s.ToDomain()), ct)).ToHttp(n => Results.Ok(new { saved = n })));

        g.MapPatch("/{id:guid}", async (Guid id, SolveUpdate body, HttpContext ctx, SolveService svc, CancellationToken ct) =>
            (await svc.UpdateAsync(ctx.User.UserId()!.Value, id, body.Penalty, body.Tags, ct)).ToHttp(_ => Results.NoContent()));

        g.MapDelete("/{id:guid}", async (Guid id, HttpContext ctx, SolveService svc, CancellationToken ct) =>
            (await svc.DeleteAsync(ctx.User.UserId()!.Value, id, ct)).ToHttp(_ => Results.NoContent()));

        g.MapDelete("/", async (string? mode, HttpContext ctx, SolveService svc, CancellationToken ct) =>
            (await svc.DeleteAllAsync(ctx.User.UserId()!.Value, mode, ct)).ToHttp(n => Results.Ok(new { deleted = n })));

        // Delta sync: everything (edits, deletes as tombstones, case statuses) after revision `since`.
        api.MapGet("/sync/changes", async (long? since, int? limit, HttpContext ctx, SyncService svc, CancellationToken ct) =>
            (await svc.ChangesAsync(ctx.User.UserId()!.Value, since ?? 0, limit, ct)).ToHttp(c => Results.Ok(new SyncChangesDto(
                c.Cursor,
                c.HasMore,
                c.Solves.Select(SolveDto.From).ToList(),
                c.CaseStatuses.Select(x => new CaseStatusDto(x.CaseId, x.Status, x.Rev)).ToList()))))
            .WithTags("Sync").RequireAuthorization();
    }
}
