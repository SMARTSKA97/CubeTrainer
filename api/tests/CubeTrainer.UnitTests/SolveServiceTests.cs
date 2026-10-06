using CubeTrainer.Application.Cases;
using CubeTrainer.Application.Common;
using CubeTrainer.Application.Solves;
using CubeTrainer.Domain.Solves;
using CubeTrainer.Infrastructure.Persistence.InMemory;

namespace CubeTrainer.UnitTests;

public class SolveServiceTests
{
    private readonly SolveService _svc = new(new InMemorySolveRepository());

    [Fact]
    public async Task Upsert_is_idempotent_and_listing_is_oldest_first()
    {
        var a = TestData.Solve(1000, atMs: 2);
        var b = TestData.Solve(2000, atMs: 1);
        await _svc.UpsertAsync([a, b], default);
        await _svc.UpsertAsync([a], default);
        var list = (await _svc.ListAsync(null, null, default)).Value!;
        Assert.Equal([b.Id, a.Id], list.Select(s => s.Id).ToArray());
    }

    [Fact]
    public async Task Bulk_error_names_the_offending_index()
    {
        var bad = TestData.Solve(1000);
        bad.Penalty = "nope";
        var r = await _svc.UpsertAsync([TestData.Solve(1000), bad], default);
        Assert.False(r.IsSuccess);
        Assert.Equal(ErrorKind.Validation, r.Error!.Kind);
        Assert.StartsWith("solves[1]:", r.Error.Message);
    }

    [Fact]
    public async Task Patch_missing_solve_is_not_found_and_empty_patch_is_invalid()
    {
        Assert.Equal(ErrorKind.NotFound, (await _svc.UpdateAsync(Guid.NewGuid(), "dnf", null, default)).Error!.Kind);
        Assert.Equal(ErrorKind.Validation, (await _svc.UpdateAsync(Guid.NewGuid(), null, null, default)).Error!.Kind);
    }

    [Fact]
    public async Task Delete_all_by_mode_only_removes_that_mode()
    {
        await _svc.UpsertAsync([TestData.Solve(1000), TestData.Solve(1000, mode: SolveModes.Case, caseId: "J1")], default);
        Assert.Equal(1, (await _svc.DeleteAllAsync(SolveModes.Case, default)).Value);
        Assert.Single((await _svc.ListAsync(null, null, default)).Value!);
    }

    [Fact]
    public async Task Case_status_validates_and_round_trips()
    {
        var svc = new CaseStatusService(new InMemoryCaseStatusRepository());
        Assert.False((await svc.SetAsync("J1", "bogus", default)).IsSuccess);
        Assert.False((await svc.SetAsync(new string('x', 65), "learning", default)).IsSuccess);
        Assert.True((await svc.SetAsync("J1", "finished", default)).IsSuccess);
        Assert.Equal("finished", (await svc.GetAllAsync(default))["J1"]);
    }
}
