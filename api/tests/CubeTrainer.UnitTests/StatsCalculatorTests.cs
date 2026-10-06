using CubeTrainer.Application.Stats;
using CubeTrainer.Domain.Solves;

namespace CubeTrainer.UnitTests;

public class StatsCalculatorTests
{
    [Fact]
    public void Empty_list_has_no_values()
    {
        var r = StatsCalculator.Compute([]);
        Assert.Equal(0, r.Count);
        Assert.Null(r.Best);
        Assert.Null(r.Mean);
        Assert.Null(r.Ao5);
    }

    [Fact]
    public void Ao5_drops_best_and_worst()
    {
        var r = StatsCalculator.Compute(TestData.Series(10000, 12000, 11000, 15000, 9000));
        Assert.Equal(11000d, r.Ao5);
        Assert.Equal(9000, r.Best);
    }

    [Fact]
    public void Plus2_is_added_and_dnf_is_excluded_from_best_and_mean()
    {
        var list = new List<Solve> { TestData.Solve(10000, Penalties.Plus2), TestData.Solve(5000, Penalties.Dnf), TestData.Solve(20000) };
        var r = StatsCalculator.Compute(list);
        Assert.Equal(12000, r.Best);
        Assert.Equal(16000d, r.Mean);
    }

    [Fact]
    public void One_dnf_in_ao5_is_dropped_but_two_make_it_dnf()
    {
        var one = TestData.Series(10000, 11000, 12000, 13000, 14000);
        one[2].Penalty = Penalties.Dnf;
        Assert.Equal(12666.666, StatsCalculator.Compute(one).Ao5!.Value, 2);

        var two = TestData.Series(10000, 11000, 12000, 13000, 14000);
        two[1].Penalty = Penalties.Dnf;
        two[2].Penalty = Penalties.Dnf;
        var r = StatsCalculator.Compute(two);
        Assert.Null(r.Ao5);
        Assert.True(r.Ao5IsDnf);
    }

    [Fact]
    public void Best_ao5_scans_every_window()
    {
        var r = StatsCalculator.Compute(TestData.Series(20000, 20000, 20000, 20000, 20000, 9000, 9000, 9000, 9000, 9000));
        Assert.Equal(9000d, r.BestAo5);
        Assert.Equal(9000d, r.Ao5);
    }

    [Fact]
    public void Too_few_solves_gives_null_not_dnf()
    {
        var (value, dnf) = StatsCalculator.AverageOf(TestData.Series(1, 2, 3), 5);
        Assert.Null(value);
        Assert.False(dnf);
    }
}
