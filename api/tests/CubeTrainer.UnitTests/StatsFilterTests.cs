using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Solves;
using CubeTrainer.Application.Stats;
using CubeTrainer.Domain.Solves;
using CubeTrainer.Infrastructure.Persistence.InMemory;

namespace CubeTrainer.UnitTests;

public class StatsFilterTests
{
    private static Solve S(int ms, long at, string? cube = null, string? method = null, string? stage = null)
    {
        var s = TestData.Solve(ms, atMs: at);
        s.Cube = cube;
        s.Method = method;
        s.Stage = stage;
        return s;
    }

    private static readonly List<Solve> Sample =
    [
        S(10_000, 1_000, "GAN 13", "cfop"),
        S(12_000, 2_000, "GAN 13", "cfop", "cross"),
        S(20_000, 3_000, "Moyu", "roux"),
        S(30_000, 4_000),
    ];

    [Fact]
    public void Narrows_by_time_window_inclusive()
    {
        Assert.Equal(2, new StatsFilter(FromMs: 2_000, ToMs: 3_000).Apply(Sample).Count);
        Assert.Equal(4, new StatsFilter().Apply(Sample).Count);
    }

    [Fact]
    public void Narrows_by_cube_and_method_ignoring_case()
    {
        Assert.Equal(2, new StatsFilter(Cube: "gan 13").Apply(Sample).Count);
        Assert.Single(new StatsFilter(Method: "ROUX").Apply(Sample));
        Assert.Single(new StatsFilter(Cube: "GAN 13", Stage: "cross").Apply(Sample));
    }

    [Fact]
    public void A_missing_stage_counts_as_a_full_solve()
    {
        Assert.Equal(3, new StatsFilter(Stage: "full").Apply(Sample).Count);
    }

    [Fact]
    public async Task The_service_applies_the_filter_and_rejects_an_upside_down_range()
    {
        var repo = new InMemorySolveRepository();
        var user = Guid.NewGuid();
        await repo.UpsertAsync(user, Sample.Select(s => s.Copy()).ToList(), default);
        var svc = new StatsService(repo);

        var all = await svc.ComputeAsync(user, null, null, default);
        var gan = await svc.ComputeAsync(user, null, null, default, new StatsFilter(Cube: "GAN 13"));
        Assert.Equal(4, all.Value!.Count);
        Assert.Equal(2, gan.Value!.Count);

        var bad = await svc.ComputeAsync(user, null, null, default, new StatsFilter(FromMs: 5, ToMs: 1));
        Assert.False(bad.IsSuccess);
        Assert.Equal("invalid_range", bad.Error!.Code);
    }

    [Fact]
    public void Validator_limits_the_label_length()
    {
        var ok = TestData.Solve(9000);
        ok.Cube = "GAN 13 Maglev";
        Assert.Null(SolveValidator.Validate(ok));
        ok.Method = new string('x', 49);
        Assert.NotNull(SolveValidator.Validate(ok));
    }
}
