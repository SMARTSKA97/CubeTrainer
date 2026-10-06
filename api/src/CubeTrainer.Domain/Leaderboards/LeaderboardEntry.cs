namespace CubeTrainer.Domain.Leaderboards;

/// <summary>One person's best result for one metric over one period. Rebuilt from their solves by a background job.</summary>
public sealed class LeaderboardEntry
{
    public Guid UserId { get; set; }

    public string Metric { get; set; } = string.Empty;

    public string Period { get; set; } = string.Empty;

    /// <summary>The result in milliseconds (average values are rounded).</summary>
    public int ValueMs { get; set; }

    /// <summary>Epoch ms of the solve that completed the result (the last solve of an average).</summary>
    public long AchievedAtMs { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}

public static class LeaderboardMetrics
{
    public const string Single = "single";
    public const string Ao5 = "ao5";
    public const string Ao12 = "ao12";

    public static readonly IReadOnlyList<string> All = [Single, Ao5, Ao12];

    public static bool IsValid(string? v) => v is not null && All.Contains(v);

    /// <summary>How many consecutive solves a metric spans.</summary>
    public static int Window(string metric) => metric switch { Ao5 => 5, Ao12 => 12, _ => 1 };
}

public static class LeaderboardPeriods
{
    public const string AllTime = "all";
    public const string Last30Days = "30d";

    public static readonly IReadOnlyList<string> All = [AllTime, Last30Days];

    public static bool IsValid(string? v) => v is not null && All.Contains(v);
}
