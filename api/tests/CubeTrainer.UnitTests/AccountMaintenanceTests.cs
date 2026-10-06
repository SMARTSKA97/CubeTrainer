using CubeTrainer.Application.Account;
using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Cases;
using Microsoft.Extensions.DependencyInjection;

namespace CubeTrainer.UnitTests;

public class AccountMaintenanceTests
{
    [Fact]
    public async Task Export_contains_my_data_and_nothing_secret()
    {
        var f = new AuthFixture();
        var s = await f.RegisteredAndSignedInAsync();
        var id = s.User.Id;
        var solves = f.Provider.GetRequiredService<ISolveRepository>();
        var keep = TestData.Solve(9_000);
        keep.Cube = "GAN 13";
        var gone = TestData.Solve(8_000);
        await solves.UpsertAsync(id, [keep, gone], default);
        await solves.DeleteAsync(id, gone.Id, default);
        await f.Provider.GetRequiredService<CaseStatusService>().SetAsync(id, "oll-21", "learning", default);
        // someone else's solve must never appear
        await solves.UpsertAsync(Guid.NewGuid(), [TestData.Solve(1_000)], default);

        var export = await f.Provider.GetRequiredService<AccountExportService>().ExportAsync(id, default);
        Assert.True(export.IsSuccess);
        Assert.Equal("sub@example.com", export.Value!.Profile.Email);
        Assert.Single(export.Value.Solves);
        Assert.Equal("GAN 13", export.Value.Solves[0].Cube);
        Assert.Equal("learning", export.Value.CaseStatus["oll-21"]);

        var json = System.Text.Json.JsonSerializer.Serialize(export.Value);
        Assert.DoesNotContain("passwordHash", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("totpSecret", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Purging_removes_only_old_tombstones()
    {
        var repo = new CubeTrainer.Infrastructure.Persistence.InMemory.InMemorySolveRepository();
        var user = Guid.NewGuid();
        var live = TestData.Solve(9_000);
        var deleted = TestData.Solve(8_000);
        await repo.UpsertAsync(user, [live, deleted], default);
        await repo.DeleteAsync(user, deleted.Id, default);

        Assert.Equal(0, await repo.PurgeTombstonesAsync(DateTimeOffset.UtcNow.AddDays(-90), default)); // too recent
        Assert.Equal(1, await repo.PurgeTombstonesAsync(DateTimeOffset.UtcNow.AddDays(1), default));
        var rest = await repo.ChangesSinceAsync(user, 0, 100, default);
        Assert.Single(rest);
        Assert.Equal(live.Id, rest[0].Id);
    }
}
