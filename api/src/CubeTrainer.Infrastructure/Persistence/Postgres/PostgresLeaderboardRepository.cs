using CubeTrainer.Application.Abstractions;
using CubeTrainer.Domain.Leaderboards;
using Microsoft.EntityFrameworkCore;

namespace CubeTrainer.Infrastructure.Persistence.Postgres;

public sealed class PostgresLeaderboardRepository(CubeDbContext db) : ILeaderboardRepository
{
    public async Task ReplaceForUserAsync(Guid userId, IReadOnlyList<LeaderboardEntry> entries, CancellationToken ct)
    {
        await db.LeaderboardEntries.Where(e => e.UserId == userId).ExecuteDeleteAsync(ct);
        if (entries.Count == 0) return;
        db.LeaderboardEntries.AddRange(entries);
        await db.SaveChangesAsync(ct);
        db.ChangeTracker.Clear();
    }

    public async Task<IReadOnlyList<LeaderboardEntry>> ForUserAsync(Guid userId, CancellationToken ct) =>
        await db.LeaderboardEntries.AsNoTracking().Where(e => e.UserId == userId).ToListAsync(ct);

    public async Task<IReadOnlyList<LeaderboardRow>> QueryAsync(string metric, string period, string? country, string? method, int limit, CancellationToken ct)
    {
        var q = from e in db.LeaderboardEntries.AsNoTracking()
                join u in db.Users.AsNoTracking() on e.UserId equals u.Id
                where e.Metric == metric && e.Period == period && u.LeaderboardOptIn && u.EmailConfirmed
                select new { e.ValueMs, e.AchievedAtMs, u.Handle, u.Country, u.CubeMethod };
        if (country is not null) q = q.Where(r => r.Country == country);
        if (method is not null) q = q.Where(r => r.CubeMethod == method);

        var list = await q.OrderBy(r => r.ValueMs).ThenBy(r => r.AchievedAtMs).Take(limit).ToListAsync(ct);
        var result = new List<LeaderboardRow>(list.Count);
        for (var i = 0; i < list.Count; i++)
        {
            var rank = i > 0 && list[i].ValueMs == list[i - 1].ValueMs ? result[i - 1].Rank : i + 1;
            result.Add(new LeaderboardRow(rank, list[i].Handle, list[i].Country, list[i].CubeMethod, list[i].ValueMs, list[i].AchievedAtMs));
        }

        return result;
    }

    public async Task<int?> RankOfAsync(Guid userId, string metric, string period, CancellationToken ct)
    {
        var mine = await db.LeaderboardEntries.AsNoTracking().FirstOrDefaultAsync(e => e.UserId == userId && e.Metric == metric && e.Period == period, ct);
        if (mine is null) return null;
        var better = await (from e in db.LeaderboardEntries.AsNoTracking()
                            join u in db.Users.AsNoTracking() on e.UserId equals u.Id
                            where e.Metric == metric && e.Period == period && u.LeaderboardOptIn && u.EmailConfirmed && e.ValueMs < mine.ValueMs
                            select e.UserId).CountAsync(ct);
        return better + 1;
    }
}
