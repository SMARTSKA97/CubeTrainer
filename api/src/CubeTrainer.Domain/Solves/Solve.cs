namespace CubeTrainer.Domain.Solves;

/// <summary>One timed attempt, either on a random scramble or on a trained case.</summary>
public sealed class Solve
{
    /// <summary>Owner. Every row belongs to exactly one account.</summary>
    public Guid UserId { get; set; }

    public Guid Id { get; set; }

    /// <summary>Change number assigned by the database on every write; clients sync by it.</summary>
    public long Rev { get; set; }

    /// <summary>Set when the solve was deleted. The row stays as a tombstone so other devices learn about the delete.</summary>
    public DateTimeOffset? DeletedAt { get; set; }

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

    /// <summary>The cube used (free text, e.g. "GAN 13"), stamped from the profile when the solve was made. Lets stats be filtered per cube.</summary>
    public string? Cube { get; set; }

    /// <summary>The method in use (e.g. "cfop"), stamped like <see cref="Cube"/>.</summary>
    public string? Method { get; set; }

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
        UserId = UserId,
        Id = Id,
        Rev = Rev,
        DeletedAt = DeletedAt,
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
        Cube = Cube,
        Method = Method,
        Tags = Tags is null ? null : [.. Tags],
    };
}
