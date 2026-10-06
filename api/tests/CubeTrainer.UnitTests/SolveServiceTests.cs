using CubeTrainer.Application.Cases;
using CubeTrainer.Application.Common;
using CubeTrainer.Application.Solves;
using CubeTrainer.Application.Sync;
using CubeTrainer.Domain.Solves;
using CubeTrainer.Infrastructure.Persistence.InMemory;

namespace CubeTrainer.UnitTests;

public class SolveServiceTests
{
    private static readonly Guid Alice = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid Bob = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000002");
    private readonly SolveService _svc = new(new InMemorySolveRepository());

    [Fact]
    public async Task Upsert_is_idempotent_and_listing_is_oldest_first()
    {
        var a = TestData.Solve(1000, atMs: 2);
        var b = TestData.Solve(2000, atMs: 1);
        await _svc.UpsertAsync(Alice, [a, b], default);
        await _svc.UpsertAsync(Alice, [a], default);
        var list = (await _svc.ListAsync(Alice, null, null, default)).Value!;
        Assert.Equal([b.Id, a.Id], list.Select(s => s.Id).ToArray());
    }

    [Fact]
    public async Task Bulk_error_names_the_offending_index()
    {
        var bad = TestData.Solve(1000);
        bad.Penalty = "nope";
        var r = await _svc.UpsertAsync(Alice, [TestData.Solve(1000), bad], default);
        Assert.False(r.IsSuccess);
        Assert.Equal(ErrorKind.Validation, r.Error!.Kind);
        Assert.StartsWith("solves[1]:", r.Error.Message);
    }

    [Fact]
    public async Task Patch_missing_solve_is_not_found_and_empty_patch_is_invalid()
    {
        Assert.Equal(ErrorKind.NotFound, (await _svc.UpdateAsync(Alice, Guid.NewGuid(), "dnf", null, default)).Error!.Kind);
        Assert.Equal(ErrorKind.Validation, (await _svc.UpdateAsync(Alice, Guid.NewGuid(), null, null, default)).Error!.Kind);
    }

    [Fact]
    public async Task Delete_all_by_mode_only_removes_that_mode()
    {
        await _svc.UpsertAsync(Alice, [TestData.Solve(1000), TestData.Solve(1000, mode: SolveModes.Case, caseId: "J1")], default);
        Assert.Equal(1, (await _svc.DeleteAllAsync(Alice, SolveModes.Case, default)).Value);
        Assert.Single((await _svc.ListAsync(Alice, null, null, default)).Value!);
    }

    [Fact]
    public async Task Users_never_see_or_change_each_others_solves()
    {
        var mine = TestData.Solve(1000);
        await _svc.UpsertAsync(Alice, [mine], default);

        Assert.Empty((await _svc.ListAsync(Bob, null, null, default)).Value!);
        Assert.Equal(ErrorKind.NotFound, (await _svc.UpdateAsync(Bob, mine.Id, "dnf", null, default)).Error!.Kind);
        Assert.Equal(ErrorKind.NotFound, (await _svc.DeleteAsync(Bob, mine.Id, default)).Error!.Kind);
        Assert.Equal(0, (await _svc.DeleteAllAsync(Bob, null, default)).Value);
        Assert.Equal("none", (await _svc.ListAsync(Alice, null, null, default)).Value!.Single().Penalty);
    }

    [Fact]
    public async Task Same_id_uploaded_by_two_users_stays_two_separate_rows()
    {
        var shared = TestData.Solve(1000);
        await _svc.UpsertAsync(Alice, [shared], default);
        var theirs = TestData.Solve(9000);
        theirs.Id = shared.Id;
        await _svc.UpsertAsync(Bob, [theirs], default);

        Assert.Equal(1000, (await _svc.ListAsync(Alice, null, null, default)).Value!.Single().TimeMs);
        Assert.Equal(9000, (await _svc.ListAsync(Bob, null, null, default)).Value!.Single().TimeMs);
    }

    [Fact]
    public async Task A_deleted_solve_is_not_brought_back_by_a_stale_upload()
    {
        var s = TestData.Solve(1000);
        await _svc.UpsertAsync(Alice, [s], default);
        await _svc.DeleteAsync(Alice, s.Id, default);

        Assert.Equal(0, (await _svc.UpsertAsync(Alice, [s], default)).Value);
        Assert.Empty((await _svc.ListAsync(Alice, null, null, default)).Value!);
    }

    [Fact]
    public async Task Case_status_validates_and_round_trips_per_user()
    {
        var svc = new CaseStatusService(new InMemoryCaseStatusRepository());
        Assert.False((await svc.SetAsync(Alice, "J1", "bogus", default)).IsSuccess);
        Assert.False((await svc.SetAsync(Alice, new string('x', 65), "learning", default)).IsSuccess);
        Assert.True((await svc.SetAsync(Alice, "J1", "finished", default)).IsSuccess);
        Assert.Equal("finished", (await svc.GetAllAsync(Alice, default))["J1"]);
        Assert.Empty(await svc.GetAllAsync(Bob, default));
    }
}

public class SyncServiceTests
{
    private static readonly Guid Alice = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid Bob = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000002");
    private readonly InMemorySolveRepository _solves = new();
    private readonly InMemoryCaseStatusRepository _statuses = new();
    private readonly SolveService _svc;
    private readonly SyncService _sync;

    public SyncServiceTests()
    {
        _svc = new SolveService(_solves);
        _sync = new SyncService(_solves, _statuses);
    }

    [Fact]
    public async Task First_pull_returns_everything_and_a_later_pull_only_the_changes()
    {
        var a = TestData.Solve(1000);
        var b = TestData.Solve(2000);
        await _svc.UpsertAsync(Alice, [a, b], default);
        await _statuses.SetAsync(Alice, "J1", "learning", default);

        var first = (await _sync.ChangesAsync(Alice, 0, null, default)).Value!;
        Assert.Equal(2, first.Solves.Count);
        Assert.Single(first.CaseStatuses);
        Assert.False(first.HasMore);

        await _svc.UpdateAsync(Alice, a.Id, "dnf", null, default);
        await _svc.DeleteAsync(Alice, b.Id, default);
        var second = (await _sync.ChangesAsync(Alice, first.Cursor, null, default)).Value!;
        Assert.Equal(2, second.Solves.Count);
        Assert.Contains(second.Solves, s => s.Id == a.Id && s.Penalty == "dnf" && s.DeletedAt is null);
        Assert.Contains(second.Solves, s => s.Id == b.Id && s.DeletedAt is not null); // tombstone
        Assert.Empty(second.CaseStatuses);

        var third = (await _sync.ChangesAsync(Alice, second.Cursor, null, default)).Value!;
        Assert.Empty(third.Solves);
        Assert.Equal(second.Cursor, third.Cursor);
    }

    [Fact]
    public async Task Paging_walks_all_changes_without_gaps_or_repeats()
    {
        var all = Enumerable.Range(1, 7).Select(i => TestData.Solve(1000 + i)).ToList();
        await _svc.UpsertAsync(Alice, all, default);
        await _statuses.SetAsync(Alice, "J1", "finished", default);

        var seen = new List<Guid>();
        var statusCount = 0;
        long cursor = 0;
        for (var guard = 0; guard < 10; guard++)
        {
            var page = (await _sync.ChangesAsync(Alice, cursor, 3, default)).Value!;
            seen.AddRange(page.Solves.Select(s => s.Id));
            statusCount += page.CaseStatuses.Count;
            cursor = page.Cursor;
            if (!page.HasMore) break;
        }

        Assert.Equal(all.Select(s => s.Id).Order(), seen.Order());
        Assert.Equal(1, statusCount);
    }

    [Fact]
    public async Task Changes_are_per_user_and_a_bad_cursor_is_rejected()
    {
        await _svc.UpsertAsync(Alice, [TestData.Solve(1000)], default);
        Assert.Empty((await _sync.ChangesAsync(Bob, 0, null, default)).Value!.Solves);
        Assert.Equal(ErrorKind.Validation, (await _sync.ChangesAsync(Alice, -1, null, default)).Error!.Kind);
    }
}
