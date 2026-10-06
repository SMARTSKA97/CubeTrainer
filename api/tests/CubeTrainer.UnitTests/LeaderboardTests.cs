using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Auth;
using CubeTrainer.Application.Leaderboards;
using CubeTrainer.Domain.Leaderboards;
using CubeTrainer.Domain.Solves;
using Microsoft.Extensions.DependencyInjection;

namespace CubeTrainer.UnitTests;

public class LeaderboardCalculatorTests
{
    private const long Now = 1_800_000_000_000;
    private static readonly DateTimeOffset At = DateTimeOffset.FromUnixTimeMilliseconds(Now);

    private static Solve S(int ms, long atMs, string penalty = Penalties.None, string mode = SolveModes.Random, string? stage = null)
    {
        var s = TestData.Solve(ms, penalty, atMs, mode, mode == SolveModes.Case ? "c1" : null);
        s.Stage = stage;
        return s;
    }

    private static int? Value(IReadOnlyList<LeaderboardEntry> e, string metric, string period) =>
        e.FirstOrDefault(x => x.Metric == metric && x.Period == period)?.ValueMs;

    [Fact]
    public void Best_single_ignores_dnf_and_implausible_times()
    {
        var solves = new[] { S(12_000, 1), S(2_000, 2), S(9_500, 3, Penalties.Plus2), S(8_000, 4, Penalties.Dnf) };
        var e = LeaderboardCalculator.Compute(Guid.NewGuid(), solves, Now, At);
        Assert.Equal(11_500, Value(e, "single", "all")); // 9.5 + 2 beats 12.0; the 2.0 s time is ignored
    }

    [Fact]
    public void Ao5_drops_best_and_worst_and_needs_five_solves()
    {
        var four = Enumerable.Range(0, 4).Select(i => S(10_000, i + 1)).ToList();
        Assert.Null(Value(LeaderboardCalculator.Compute(Guid.NewGuid(), four, Now, At), "ao5", "all"));

        var five = new[] { S(10_000, 1), S(11_000, 2), S(12_000, 3), S(20_000, 4), S(9_000, 5) };
        var e = LeaderboardCalculator.Compute(Guid.NewGuid(), five, Now, At);
        Assert.Equal(11_000, Value(e, "ao5", "all")); // (10 + 11 + 12) / 3
        Assert.Equal(5, e.First(x => x.Metric == "ao5").AchievedAtMs);
    }

    [Fact]
    public void One_dnf_is_dropped_two_ruin_the_average()
    {
        var one = new[] { S(10_000, 1), S(10_000, 2), S(10_000, 3), S(10_000, 4), S(10_000, 5, Penalties.Dnf) };
        Assert.Equal(10_000, Value(LeaderboardCalculator.Compute(Guid.NewGuid(), one, Now, At), "ao5", "all"));
        var two = new[] { S(10_000, 1), S(10_000, 2), S(10_000, 3, Penalties.Dnf), S(10_000, 4), S(10_000, 5, Penalties.Dnf) };
        Assert.Null(Value(LeaderboardCalculator.Compute(Guid.NewGuid(), two, Now, At), "ao5", "all"));
    }

    [Fact]
    public void A_window_containing_an_implausible_time_is_skipped()
    {
        var five = new[] { S(10_000, 1), S(10_000, 2), S(1_000, 3), S(10_000, 4), S(10_000, 5) };
        Assert.Null(Value(LeaderboardCalculator.Compute(Guid.NewGuid(), five, Now, At), "ao5", "all"));
    }

    [Fact]
    public void Only_full_random_solves_count_and_the_30_day_period_is_recent_only()
    {
        var old = Now - 40L * 24 * 3600 * 1000;
        var solves = new[]
        {
            S(5_000, old),                                   // fast but old: all-time only
            S(4_000, Now - 1000, mode: SolveModes.Case),     // case training: ignored
            S(4_500, Now - 2000, stage: "cross"),            // stage drill: ignored
            S(9_000, Now - 3000),
        };
        var e = LeaderboardCalculator.Compute(Guid.NewGuid(), solves, Now, At);
        Assert.Equal(5_000, Value(e, "single", "all"));
        Assert.Equal(9_000, Value(e, "single", "30d"));
    }

    [Fact]
    public void Deleted_solves_never_count()
    {
        var gone = S(5_000, 1);
        gone.DeletedAt = At;
        Assert.Empty(LeaderboardCalculator.Compute(Guid.NewGuid(), [gone], Now, At));
    }
}

public class LeaderboardServiceTests
{
    private static async Task<(Guid Id, string Handle)> Person(AuthFixture f, string email, string handle, string country, string method, bool optIn, params int[] times)
    {
        var req = AuthFixture.NewUser(email, handle) with { Country = country, CubeMethod = method };
        Assert.True((await f.Auth.RegisterAsync(req, default)).IsSuccess);
        Assert.True((await f.Auth.VerifyEmailAsync(f.Mail.TokenFrom("Confirm your email"), default)).IsSuccess);
        var session = (await f.Auth.LoginAsync(email, AuthFixture.Password, AuthFixture.Client(), default)).Value!;
        if (optIn) Assert.True((await f.Auth.UpdateProfileAsync(session.User.Id, new ProfileUpdate(null, null, null, null, null, true), default)).IsSuccess);
        var repo = f.Provider.GetRequiredService<ISolveRepository>();
        var now = f.Clock.GetUtcNow().ToUnixTimeMilliseconds();
        await repo.UpsertAsync(session.User.Id, times.Select((t, i) => { var s = TestData.Solve(t, atMs: now - 10_000 + i); return s; }).ToList(), default);
        return (session.User.Id, handle);
    }

    [Fact]
    public async Task Board_ranks_only_opted_in_people_and_supports_filters()
    {
        var f = new AuthFixture();
        var svc = f.Provider.GetRequiredService<LeaderboardService>();
        await Person(f, "a@example.com", "alice_in", "IN", "cfop", true, 9_000);
        await Person(f, "b@example.com", "bob_us", "US", "roux", true, 8_000);
        await Person(f, "c@example.com", "carol_hidden", "IN", "cfop", false, 5_000);
        await svc.RefreshAllAsync(default);

        var all = (await svc.BoardAsync("single", "all", null, null, null, default)).Value!;
        Assert.Equal(["bob_us", "alice_in"], all.Select(r => r.Handle).ToArray());
        Assert.Equal([1, 2], all.Select(r => r.Rank).ToArray());

        Assert.Equal(["alice_in"], (await svc.BoardAsync("single", "all", "in", null, null, default)).Value!.Select(r => r.Handle).ToArray());
        Assert.Equal(["bob_us"], (await svc.BoardAsync("single", "all", null, "roux", null, default)).Value!.Select(r => r.Handle).ToArray());
    }

    [Fact]
    public async Task Ties_share_a_rank_and_the_earlier_result_is_listed_first()
    {
        var f = new AuthFixture();
        var svc = f.Provider.GetRequiredService<LeaderboardService>();
        await Person(f, "a@example.com", "first_one", "IN", "cfop", true, 9_000);
        f.Clock.Advance(TimeSpan.FromMinutes(1));
        await Person(f, "b@example.com", "second_one", "IN", "cfop", true, 9_000);
        await svc.RefreshAllAsync(default);
        var rows = (await svc.BoardAsync("single", "all", null, null, null, default)).Value!;
        Assert.Equal(["first_one", "second_one"], rows.Select(r => r.Handle).ToArray());
        Assert.Equal([1, 1], rows.Select(r => r.Rank).ToArray());
    }

    [Fact]
    public async Task Opting_out_removes_someone_immediately()
    {
        var f = new AuthFixture();
        var svc = f.Provider.GetRequiredService<LeaderboardService>();
        var a = await Person(f, "a@example.com", "leaving_soon", "IN", "cfop", true, 9_000);
        await svc.RefreshAllAsync(default);
        Assert.Single((await svc.BoardAsync("single", "all", null, null, null, default)).Value!);
        await f.Auth.UpdateProfileAsync(a.Id, new ProfileUpdate(null, null, null, null, null, false), default);
        Assert.Empty((await svc.BoardAsync("single", "all", null, null, null, default)).Value!);
        Assert.False((await svc.MineAsync(a.Id, default)).Value!.OptedIn);
    }

    [Fact]
    public async Task My_standing_is_refreshed_on_demand_and_ranked()
    {
        var f = new AuthFixture();
        var svc = f.Provider.GetRequiredService<LeaderboardService>();
        var fast = await Person(f, "a@example.com", "fast_one", "IN", "cfop", true, 7_000);
        await svc.RefreshUserAsync(fast.Id, default); // the background job would normally do this
        var me = await Person(f, "b@example.com", "me_myself", "IN", "cfop", true, 9_000);
        var mine = (await svc.MineAsync(me.Id, default)).Value!; // my own results are computed on demand
        Assert.True(mine.OptedIn);
        var single = mine.Standings.First(s => s is { Metric: "single", Period: "all" });
        Assert.Equal(9_000, single.ValueMs);
        Assert.Equal(2, single.Rank);
    }

    [Fact]
    public async Task Bad_parameters_are_rejected()
    {
        var f = new AuthFixture();
        var svc = f.Provider.GetRequiredService<LeaderboardService>();
        Assert.Equal("invalid_metric", (await svc.BoardAsync("ao100", null, null, null, null, default)).Error!.Code);
        Assert.Equal("invalid_period", (await svc.BoardAsync("single", "week", null, null, null, default)).Error!.Code);
        Assert.Equal("invalid_country", (await svc.BoardAsync("single", null, "India", null, null, default)).Error!.Code);
        Assert.Equal("invalid_method", (await svc.BoardAsync("single", null, null, "magic", null, default)).Error!.Code);
    }
}
