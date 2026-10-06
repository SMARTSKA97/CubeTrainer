using CubeTrainer.Domain.Solves;

namespace CubeTrainer.Application.Stats;

public sealed record StatsResult(
    int Count,
    int? Best,
    double? Mean,
    double? Ao5,
    bool Ao5IsDnf,
    double? Ao12,
    bool Ao12IsDnf,
    double? Ao100,
    bool Ao100IsDnf,
    double? BestAo5,
    double? BestAo12);

/// <summary>Same maths as the Angular client (WCA-style trimmed averages, DNF aware).</summary>
public static class StatsCalculator
{
    /// <param name="solvesOldestFirst">Solves ordered oldest to newest.</param>
    public static StatsResult Compute(IReadOnlyList<Solve> solvesOldestFirst)
    {
        var s = solvesOldestFirst;
        var valid = s.Select(x => x.EffectiveMs).Where(x => x.HasValue).Select(x => x!.Value).ToList();
        var ao5 = AverageOf(s, 5);
        var ao12 = AverageOf(s, 12);
        var ao100 = AverageOf(s, 100);
        return new StatsResult(
            s.Count,
            valid.Count > 0 ? valid.Min() : null,
            valid.Count > 0 ? valid.Average() : null,
            ao5.Value, ao5.IsDnf,
            ao12.Value, ao12.IsDnf,
            ao100.Value, ao100.IsDnf,
            BestAverageOf(s, 5),
            BestAverageOf(s, 12));
    }

    /// <summary>Average of the newest <paramref name="n"/> solves. Value is null while there are too few solves or on DNF.</summary>
    public static (double? Value, bool IsDnf) AverageOf(IReadOnlyList<Solve> oldestFirst, int n)
    {
        if (oldestFirst.Count < n) return (null, false);
        var last = oldestFirst.Skip(oldestFirst.Count - n).Select(x => x.EffectiveMs).ToList();
        var cut = n >= 100 ? (int)Math.Ceiling(n * 0.05) : 1;
        if (last.Count(x => x is null) > cut) return (null, true);
        var sorted = last.Select(x => x.HasValue ? (double)x.Value : double.PositiveInfinity).OrderBy(x => x).ToList();
        var kept = sorted.Skip(cut).Take(sorted.Count - 2 * cut).ToList();
        return (kept.Average(), false);
    }

    public static double? BestAverageOf(IReadOnlyList<Solve> oldestFirst, int n)
    {
        double? best = null;
        for (var i = n; i <= oldestFirst.Count; i++)
        {
            var window = oldestFirst.Skip(i - n).Take(n).ToList();
            var (v, _) = AverageOf(window, n);
            if (v.HasValue && (best is null || v < best)) best = v;
        }
        return best;
    }
}
