using CubeTrainer.Application.Summary;

namespace CubeTrainer.UnitTests;

public class SummaryCalculatorTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 6, 20, 0, 0, TimeSpan.Zero); // 01:30 on the 7th in India

    private static long Ms(DateTimeOffset t) => t.ToUnixTimeMilliseconds();

    [Fact]
    public void Timezone_decides_which_day_a_solve_belongs_to()
    {
        var solves = new[] { TestData.Solve(9000, atMs: Ms(Now)) };
        var utc = SummaryCalculator.Compute(solves, new Dictionary<string, string>(), 0, Now);
        var india = SummaryCalculator.Compute(solves, new Dictionary<string, string>(), 330, Now);
        Assert.Equal("2026-10-06", utc.Last7Days[^1].Date);
        Assert.Equal("2026-10-07", india.Last7Days[^1].Date);
        Assert.Equal(1, utc.SolvesToday);
        Assert.Equal(1, india.SolvesToday);
    }

    [Fact]
    public void Streak_survives_until_you_practise_today()
    {
        var solves = new[]
        {
            TestData.Solve(9000, atMs: Ms(Now.AddDays(-1))),
            TestData.Solve(9000, atMs: Ms(Now.AddDays(-2))),
        };
        var r = SummaryCalculator.Compute(solves, new Dictionary<string, string>(), 0, Now);
        Assert.Equal(2, r.StreakDays);
        Assert.Equal(0, r.SolvesToday);
    }

    [Fact]
    public void Gap_breaks_the_streak_and_status_counts_cover_every_status()
    {
        var solves = new[] { TestData.Solve(9000, atMs: Ms(Now)), TestData.Solve(9000, atMs: Ms(Now.AddDays(-3))) };
        var r = SummaryCalculator.Compute(solves, new Dictionary<string, string> { ["A"] = "finished", ["B"] = "learning" }, 0, Now);
        Assert.Equal(1, r.StreakDays);
        Assert.Equal(1, r.StatusCounts["finished"]);
        Assert.Equal(1, r.StatusCounts["learning"]);
        Assert.Equal(0, r.StatusCounts["unlearned"]);
        Assert.Equal(7, r.Last7Days.Count);
    }
}
