namespace CubeTrainer.Domain.Cases;

public static class CaseStatuses
{
    public const string Unlearned = "unlearned";
    public const string Learning = "learning";
    public const string Finished = "finished";

    public static readonly IReadOnlyList<string> All = [Unlearned, Learning, Finished];

    public static bool IsValid(string? value) => value is not null && All.Contains(value);
}

/// <summary>Learning status of one algorithm case ("pll-04", "f2l-basic-12" ...).</summary>
public sealed class CaseStatusEntry
{
    public string CaseId { get; set; } = string.Empty;

    public string Status { get; set; } = CaseStatuses.Unlearned;
}
