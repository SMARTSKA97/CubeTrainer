using CubeTrainer.Domain.Leaderboards;
using CubeTrainer.Domain.Solves;

namespace CubeTrainer.Application.Leaderboards;

/// <summary>
/// Turns one person's solves into their best single / Ao5 / Ao12, all time and over the last 30 days.
/// Only full random-scramble solves count (not stage drills or case training). Results are self-reported by the app, so anything
/// under <see cref="MinPlausibleMs"/> (world-record territory) is ignored rather than ranked.
/// </summary>
public static class LeaderboardCalculator
{
    public const int MinPlausibleMs = 3_000;
    public const long ThirtyDaysMs = 30L * 24 * 60 * 60 * 1000;

    public static IReadOnlyList<LeaderboardEntry> Compute(Guid userId, IEnumerable<Solve> solves, long nowMs, DateTimeOffset updatedAt)
    {
        var eligible = solves
            .Where(s => s.DeletedAt is null && s.Mode == SolveModes.Random && (s.Stage is null || s.Stage == "full"))
            .OrderBy(s => s.AtMs).ThenBy(s => s.Id)
            .ToList();

        var entries = new List<LeaderboardEntry>();
        foreach (var period in LeaderboardPeriods.All)
        {
            var scope = period == LeaderboardPeriods.Last30Days ? eligible.Where(s => s.AtMs >= nowMs - ThirtyDaysMs).ToList() : eligible;
            foreach (var metric in LeaderboardMetrics.All)
            {
                var best = Best(scope, LeaderboardMetrics.Window(metric));
                if (best is { } b) entries.Add(new LeaderboardEntry { UserId = userId, Metric = metric, Period = period, ValueMs = b.ValueMs, AchievedAtMs = b.AtMs, UpdatedAt = updatedAt });
            }
        }

        return entries;
    }

    private static (int ValueMs, long AtMs)? Best(IReadOnlyList<Solve> oldestFirst, int n)
    {
        (int ValueMs, long AtMs)? best = null;
        for (var end = n; end <= oldestFirst.Count; end++)
        {
            var window = oldestFirst.Skip(end - n).Take(n).ToList();
            if (window.Any(s => s.EffectiveMs is { } t && t < MinPlausibleMs)) continue; // implausible: skip the whole window
            var value = n == 1 ? window[0].EffectiveMs : (int?)Average(window);
            if (value is null) continue;
            if (best is null || value < best.Value.ValueMs) best = (value.Value, window[^1].AtMs);
        }

        return best;
    }

    /// <summary>WCA-style trimmed mean of 5 or 12 (drop best and worst). More than one DNF means no average.</summary>
    private static int? Average(IReadOnlyList<Solve> window)
    {
        var times = window.Select(s => s.EffectiveMs).ToList();
        if (times.Count(t => t is null) > 1) return null;
        var sorted = times.Select(t => t.HasValue ? (double)t.Value : double.PositiveInfinity).OrderBy(t => t).ToList();
        var kept = sorted.Skip(1).Take(sorted.Count - 2).ToList();
        return (int)Math.Round(kept.Average());
    }
}
