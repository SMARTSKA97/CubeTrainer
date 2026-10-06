using CubeTrainer.Application.Abstractions;
using CubeTrainer.Domain.Leaderboards;

namespace CubeTrainer.Infrastructure.Persistence.InMemory;

public sealed class InMemoryLeaderboardRepository(IUserRepository users) : ILeaderboardRepository
{
    private readonly object _gate = new();
    private readonly List<LeaderboardEntry> _entries = [];

    public Task ReplaceForUserAsync(Guid userId, IReadOnlyList<LeaderboardEntry> entries, CancellationToken ct)
    {
        lock (_gate)
        {
            _entries.RemoveAll(e => e.UserId == userId);
            _entries.AddRange(entries);
        }

        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<LeaderboardEntry>> ForUserAsync(Guid userId, CancellationToken ct)
    {
        lock (_gate) return Task.FromResult<IReadOnlyList<LeaderboardEntry>>(_entries.Where(e => e.UserId == userId).ToList());
    }

    public async Task<IReadOnlyList<LeaderboardRow>> QueryAsync(string metric, string period, string? country, string? method, int limit, CancellationToken ct)
    {
        List<LeaderboardEntry> candidates;
        lock (_gate) candidates = _entries.Where(e => e.Metric == metric && e.Period == period).ToList();

        var rows = new List<(LeaderboardEntry E, Domain.Users.AppUser U)>();
        foreach (var e in candidates)
        {
            var u = await users.FindByIdAsync(e.UserId, ct);
            if (u is null || !u.LeaderboardOptIn || !u.EmailConfirmed) continue;
            if (country is not null && !string.Equals(u.Country, country, StringComparison.OrdinalIgnoreCase)) continue;
            if (method is not null && !string.Equals(u.CubeMethod, method, StringComparison.OrdinalIgnoreCase)) continue;
            rows.Add((e, u));
        }

        var ordered = rows.OrderBy(r => r.E.ValueMs).ThenBy(r => r.E.AchievedAtMs).Take(limit).ToList();
        var result = new List<LeaderboardRow>();
        for (var i = 0; i < ordered.Count; i++)
        {
            var rank = i > 0 && ordered[i].E.ValueMs == ordered[i - 1].E.ValueMs ? result[i - 1].Rank : i + 1;
            result.Add(new LeaderboardRow(rank, ordered[i].U.Handle, ordered[i].U.Country, ordered[i].U.CubeMethod, ordered[i].E.ValueMs, ordered[i].E.AchievedAtMs));
        }

        return result;
    }

    public async Task<int?> RankOfAsync(Guid userId, string metric, string period, CancellationToken ct)
    {
        LeaderboardEntry? mine;
        List<LeaderboardEntry> others;
        lock (_gate)
        {
            mine = _entries.FirstOrDefault(e => e.UserId == userId && e.Metric == metric && e.Period == period);
            others = _entries.Where(e => e.UserId != userId && e.Metric == metric && e.Period == period).ToList();
        }

        if (mine is null) return null;
        var better = 0;
        foreach (var e in others.Where(e => e.ValueMs < mine.ValueMs))
        {
            var u = await users.FindByIdAsync(e.UserId, ct);
            if (u is { LeaderboardOptIn: true, EmailConfirmed: true }) better++;
        }

        return better + 1;
    }
}
