namespace CubeTrainer.Domain.Solves;

public static class Penalties
{
    public const string None = "none";
    public const string Plus2 = "plus2";
    public const string Dnf = "dnf";

    public static bool IsValid(string? value) => value is None or Plus2 or Dnf;
}

public static class SolveModes
{
    public const string Random = "random";
    public const string Case = "case";

    public static bool IsValid(string? value) => value is Random or Case;
}

public static class Stages
{
    public static readonly IReadOnlyList<string> All = ["full", "cross", "f2l", "oll", "pll", "ll"];

    /// <summary>A missing stage means a full solve.</summary>
    public static bool IsValid(string? value) => value is null || All.Contains(value);
}
