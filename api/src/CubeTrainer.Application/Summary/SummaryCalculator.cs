using CubeTrainer.Domain.Cases;
using CubeTrainer.Domain.Solves;

namespace CubeTrainer.Application.Summary;

public sealed record DayCount(string Date, int Solves);

public sealed record SummaryResult(
    int TotalSolves,
    int SolvesToday,
    int CaseSolvesToday,
    int? BestTodayMs,
    int StreakDays,
    IReadOnlyList<DayCount> Last7Days,
    IReadOnlyDictionary<string, int> StatusCounts);

/// <summary>Small daily-practice summary meant for dashboards such as Life OS.</summary>
public static class SummaryCalculator
{
    /// <param name="tzOffsetMinutes">Minutes to ADD to UTC to get the user's local time (India = 330).</param>
    public static SummaryResult Compute(IReadOnlyList<Solve> solves, IReadOnlyDictionary<string, string> statuses, int tzOffsetMinutes, DateTimeOffset nowUtc)
    {
        DateOnly Day(long atMs) => DateOnly.FromDateTime(DateTimeOffset.FromUnixTimeMilliseconds(atMs).UtcDateTime.AddMinutes(tzOffsetMinutes));
        var today = DateOnly.FromDateTime(nowUtc.UtcDateTime.AddMinutes(tzOffsetMinutes));

        var perDay = solves.GroupBy(s => Day(s.AtMs)).ToDictionary(g => g.Key, g => g.ToList());
        var todays = perDay.TryGetValue(today, out var t) ? t : [];

        // streak: consecutive practice days ending today (or yesterday, so the streak is not lost before you practise)
        var streak = 0;
        var cursor = perDay.ContainsKey(today) ? today : today.AddDays(-1);
        while (perDay.ContainsKey(cursor))
        {
            streak++;
            cursor = cursor.AddDays(-1);
        }

        var last7 = Enumerable.Range(0, 7).Select(i => today.AddDays(-6 + i))
            .Select(d => new DayCount(d.ToString("yyyy-MM-dd"), perDay.TryGetValue(d, out var l) ? l.Count : 0)).ToList();

        var effective = todays.Select(s => s.EffectiveMs).Where(e => e.HasValue).Select(e => e!.Value).ToList();
        var counts = CaseStatuses.All.ToDictionary(x => x, x => statuses.Count(kv => kv.Value == x));

        return new SummaryResult(
            solves.Count,
            todays.Count,
            todays.Count(s => s.Mode == SolveModes.Case),
            effective.Count > 0 ? effective.Min() : null,
            streak,
            last7,
            counts);
    }
}
