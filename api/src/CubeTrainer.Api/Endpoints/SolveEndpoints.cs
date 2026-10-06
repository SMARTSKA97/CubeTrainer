using CubeTrainer.Api.Contracts;
using CubeTrainer.Application.Solves;

namespace CubeTrainer.Api.Endpoints;

internal static class SolveEndpoints
{
    public static void MapSolveEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/solves").WithTags("Solves");

        g.MapGet("/", async (string? mode, string? caseId, SolveService svc, CancellationToken ct) =>
            (await svc.ListAsync(mode, caseId, ct)).ToHttp(list => Results.Ok(list.Select(SolveDto.From))));

        g.MapPost("/", async (SolveDto solve, SolveService svc, CancellationToken ct) =>
            (await svc.UpsertAsync([solve.ToDomain()], ct)).ToHttp(_ => Results.Ok(solve)));

        g.MapPost("/bulk", async (List<SolveDto> solves, SolveService svc, CancellationToken ct) =>
            (await svc.UpsertAsync(solves.ConvertAll(s => s.ToDomain()), ct)).ToHttp(n => Results.Ok(new { saved = n })));

        g.MapPatch("/{id:guid}", async (Guid id, SolveUpdate body, SolveService svc, CancellationToken ct) =>
            (await svc.UpdateAsync(id, body.Penalty, body.Tags, ct)).ToHttp(_ => Results.NoContent()));

        g.MapDelete("/{id:guid}", async (Guid id, SolveService svc, CancellationToken ct) =>
            (await svc.DeleteAsync(id, ct)).ToHttp(_ => Results.NoContent()));

        g.MapDelete("/", async (string? mode, SolveService svc, CancellationToken ct) =>
            (await svc.DeleteAllAsync(mode, ct)).ToHttp(n => Results.Ok(new { deleted = n })));
    }
}
