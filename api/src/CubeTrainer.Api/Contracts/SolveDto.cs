using CubeTrainer.Domain.Solves;

namespace CubeTrainer.Api.Contracts;

/// <summary>A solve as exchanged with the clients (camelCase JSON). The wire name for epoch ms is <c>at</c>.</summary>
public sealed class SolveDto
{
    public Guid Id { get; init; }

    /// <summary>Epoch milliseconds when the solve finished.</summary>
    public long At { get; init; }

    /// <summary>Raw stopwatch time in milliseconds, without penalty.</summary>
    public int TimeMs { get; init; }

    /// <summary>"none", "plus2" or "dnf".</summary>
    public string Penalty { get; init; } = Penalties.None;

    public string Scramble { get; init; } = "";

    /// <summary>"random" or "case".</summary>
    public string Mode { get; init; } = SolveModes.Random;

    public string? SetId { get; init; }

    public string? CaseId { get; init; }

    public int? Auf { get; init; }

    public int? InspectionMs { get; init; }

    /// <summary>"full" (or null), "cross", "f2l", "oll", "pll" or "ll".</summary>
    public string? Stage { get; init; }

    /// <summary>The cube used, e.g. "GAN 13".</summary>
    public string? Cube { get; init; }

    /// <summary>The method in use, e.g. "cfop".</summary>
    public string? Method { get; init; }

    /// <summary>Mistake tags such as "pause" or "recog".</summary>
    public string[]? Tags { get; init; }

    /// <summary>Change number (responses only; ignored when sent). Sync clients remember the highest one they have seen.</summary>
    public long Rev { get; init; }

    /// <summary>True for a tombstone: the solve was deleted (sync responses only).</summary>
    public bool Deleted { get; init; }

    /// <summary>Time including penalty, or null for a DNF.</summary>
    public int? Effective => Penalty switch
    {
        Penalties.Dnf => null,
        Penalties.Plus2 => TimeMs + 2000,
        _ => TimeMs,
    };

    public Solve ToDomain() => new()
    {
        Id = Id,
        AtMs = At,
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
        Tags = Tags,
    };

    public static SolveDto From(Solve s) => new()
    {
        Id = s.Id,
        At = s.AtMs,
        TimeMs = s.TimeMs,
        Penalty = s.Penalty,
        Scramble = s.Scramble,
        Mode = s.Mode,
        SetId = s.SetId,
        CaseId = s.CaseId,
        Auf = s.Auf,
        InspectionMs = s.InspectionMs,
        Stage = s.Stage,
        Cube = s.Cube,
        Method = s.Method,
        Tags = s.Tags,
        Rev = s.Rev,
        Deleted = s.DeletedAt is not null,
    };
}

public sealed record SolveUpdate(string? Penalty, string[]? Tags);

public sealed record StatusUpdate(string? Status);

public sealed record CaseStatusDto(string CaseId, string Status, long Rev);

/// <summary>One page of changes. Send <c>cursor</c> back as <c>since</c>; keep going while <c>hasMore</c> is true.</summary>
public sealed record SyncChangesDto(long Cursor, bool HasMore, IReadOnlyList<SolveDto> Solves, IReadOnlyList<CaseStatusDto> CaseStatuses);
