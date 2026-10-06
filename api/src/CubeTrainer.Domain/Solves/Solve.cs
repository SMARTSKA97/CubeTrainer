namespace CubeTrainer.Domain.Solves;

/// <summary>One timed attempt, either on a random scramble or on a trained case.</summary>
public sealed class Solve
{
    public Guid Id { get; set; }

    /// <summary>Epoch milliseconds when the solve finished.</summary>
    public long AtMs { get; set; }

    /// <summary>Raw stopwatch time in milliseconds, without penalty.</summary>
    public int TimeMs { get; set; }

    public string Penalty { get; set; } = Penalties.None;

    public string Scramble { get; set; } = string.Empty;

    public string Mode { get; set; } = SolveModes.Random;

    public string? SetId { get; set; }

    public string? CaseId { get; set; }

    /// <summary>Random U turn applied to a trained case (0-3).</summary>
    public int? Auf { get; set; }

    public int? InspectionMs { get; set; }

    /// <summary>Timer solves: which stage was practised; null means a full solve.</summary>
    public string? Stage { get; set; }

    /// <summary>Mistake tags such as "pause" or "recog".</summary>
    public string[]? Tags { get; set; }

    /// <summary>Time including the penalty, or null for a DNF.</summary>
    public int? EffectiveMs => Penalty switch
    {
        Penalties.Dnf => null,
        Penalties.Plus2 => TimeMs + 2000,
        _ => TimeMs,
    };

    public Solve Copy() => new()
    {
        Id = Id,
        AtMs = AtMs,
        TimeMs = TimeMs,
        Penalty = Penalty,
        Scramble = Scramble,
        Mode = Mode,
        SetId = SetId,
        CaseId = CaseId,
        Auf = Auf,
        InspectionMs = InspectionMs,
        Stage = Stage,
        Tags = Tags is null ? null : [.. Tags],
    };
}
