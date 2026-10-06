using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Common;
using CubeTrainer.Domain.Leaderboards;

namespace CubeTrainer.Application.Leaderboards;

public sealed record MyStanding(string Metric, string Period, int ValueMs, long AchievedAtMs, int? Rank);

public sealed record MyLeaderboards(bool OptedIn, IReadOnlyList<MyStanding> Standings);

public sealed class LeaderboardService(
    IUserRepository users,
    ISolveRepository solves,
    ILeaderboardRepository boards,
    TimeProvider clock)
{
    public const int MaxLimit = 100;
    public static readonly TimeSpan StaleAfter = TimeSpan.FromMinutes(5);

    public async Task<Result<IReadOnlyList<LeaderboardRow>>> BoardAsync(string? metric, string? period, string? country, string? method, int? limit, CancellationToken ct)
    {
        metric ??= LeaderboardMetrics.Single;
        period ??= LeaderboardPeriods.AllTime;
        if (!LeaderboardMetrics.IsValid(metric)) return Result<IReadOnlyList<LeaderboardRow>>.Fail(ErrorKind.Validation, "invalid_metric", $"metric must be one of: {string.Join(", ", LeaderboardMetrics.All)}.");
        if (!LeaderboardPeriods.IsValid(period)) return Result<IReadOnlyList<LeaderboardRow>>.Fail(ErrorKind.Validation, "invalid_period", $"period must be one of: {string.Join(", ", LeaderboardPeriods.All)}.");
        if (!string.IsNullOrWhiteSpace(method) && !CubeTrainer.Domain.Users.CubeMethods.IsValid(method.Trim().ToLowerInvariant())) return Result<IReadOnlyList<LeaderboardRow>>.Fail(ErrorKind.Validation, "invalid_method", "Unknown method.");
        var normalizedCountry = string.IsNullOrWhiteSpace(country) ? null : country.Trim().ToUpperInvariant();
        if (normalizedCountry is { Length: not 2 }) return Result<IReadOnlyList<LeaderboardRow>>.Fail(ErrorKind.Validation, "invalid_country", "country must be a 2-letter code.");

        var rows = await boards.QueryAsync(metric, period, normalizedCountry, string.IsNullOrWhiteSpace(method) ? null : method.Trim().ToLowerInvariant(), Math.Clamp(limit ?? 50, 1, MaxLimit), ct);
        return Result<IReadOnlyList<LeaderboardRow>>.Ok(rows);
    }

    /// <summary>The signed-in person's own results and rank. Refreshes them first when they are missing or stale.</summary>
    public async Task<Result<MyLeaderboards>> MineAsync(Guid userId, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(userId, ct);
        if (user is null) return Result<MyLeaderboards>.Fail(ErrorKind.NotFound, "user_not_found", "Account not found.");
        if (!user.LeaderboardOptIn) return Result<MyLeaderboards>.Ok(new MyLeaderboards(false, []));

        var entries = await boards.ForUserAsync(userId, ct);
        if (entries.Count == 0 || clock.GetUtcNow() - entries.Max(e => e.UpdatedAt) > StaleAfter)
        {
            await RefreshUserAsync(userId, ct);
            entries = await boards.ForUserAsync(userId, ct);
        }

        var standings = new List<MyStanding>();
        foreach (var e in entries.OrderBy(e => e.Period).ThenBy(e => e.Metric))
            standings.Add(new MyStanding(e.Metric, e.Period, e.ValueMs, e.AchievedAtMs, await boards.RankOfAsync(userId, e.Metric, e.Period, ct)));
        return Result<MyLeaderboards>.Ok(new MyLeaderboards(true, standings));
    }

    public async Task RefreshUserAsync(Guid userId, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(userId, ct);
        if (user is null) return;
        if (!user.LeaderboardOptIn || !user.EmailConfirmed)
        {
            await boards.ReplaceForUserAsync(userId, [], ct);
            return;
        }

        var now = clock.GetUtcNow();
        var entries = LeaderboardCalculator.Compute(userId, await solves.ListAsync(userId, null, null, ct), now.ToUnixTimeMilliseconds(), now);
        await boards.ReplaceForUserAsync(userId, entries, ct);
    }

    /// <summary>Rebuilds everyone who opted in. Run by a background job.</summary>
    public async Task<int> RefreshAllAsync(CancellationToken ct)
    {
        var ids = await users.ListLeaderboardOptInIdsAsync(ct);
        foreach (var id in ids) await RefreshUserAsync(id, ct);
        return ids.Count;
    }
}
