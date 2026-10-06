using CubeTrainer.Domain.Solves;

namespace CubeTrainer.Application.Solves;

public static class SolveValidator
{
    public const int MaxTimeMs = 24 * 60 * 60 * 1000;
    public const int MaxTags = 12;
    public const int MaxTagLength = 24;

    /// <summary>Returns an error message, or null when the solve is acceptable.</summary>
    public static string? Validate(Solve s)
    {
        if (s.Id == Guid.Empty) return "id is required (client-generated GUID).";
        if (s.TimeMs is < 0 or > MaxTimeMs) return "timeMs is out of range.";
        if (s.AtMs <= 0) return "at (epoch ms) is required.";
        if (!Penalties.IsValid(s.Penalty)) return "penalty must be 'none', 'plus2' or 'dnf'.";
        if (!SolveModes.IsValid(s.Mode)) return "mode must be 'random' or 'case'.";
        if (string.IsNullOrWhiteSpace(s.Scramble) || s.Scramble.Length > 400) return "scramble is required (max 400 characters).";
        if (s.Mode == SolveModes.Case && string.IsNullOrWhiteSpace(s.CaseId)) return "caseId is required for mode 'case'.";
        if (s.CaseId is { Length: > 64 } || s.SetId is { Length: > 64 }) return "caseId/setId too long.";
        if (s.Auf is < 0 or > 3) return "auf must be 0-3.";
        if (s.InspectionMs is < 0) return "inspectionMs must not be negative.";
        if (!Stages.IsValid(s.Stage)) return $"stage must be one of: {string.Join(", ", Stages.All)}.";
        return ValidateTags(s.Tags);
    }

    public static string? ValidateTags(string[]? tags)
    {
        if (tags is null) return null;
        if (tags.Length > MaxTags) return $"At most {MaxTags} tags.";
        if (tags.Any(t => string.IsNullOrWhiteSpace(t) || t.Length > MaxTagLength)) return $"Tags must be 1-{MaxTagLength} characters.";
        return null;
    }
}
