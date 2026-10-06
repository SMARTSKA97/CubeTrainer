using CubeTrainer.Domain.Solves;

namespace CubeTrainer.Application.Stats;

/// <summary>Optional narrowing of a stats request: a time window (epoch ms, inclusive) and the cube or method used.</summary>
public sealed record StatsFilter(long? FromMs = null, long? ToMs = null, string? Cube = null, string? Method = null, string? Stage = null)
{
    public IReadOnlyList<Solve> Apply(IReadOnlyList<Solve> list) => list.Where(Matches).ToList();

    private bool Matches(Solve s) =>
        (FromMs is null || s.AtMs >= FromMs) &&
        (ToMs is null || s.AtMs <= ToMs) &&
        (string.IsNullOrWhiteSpace(Cube) || string.Equals(s.Cube, Cube, StringComparison.OrdinalIgnoreCase)) &&
        (string.IsNullOrWhiteSpace(Method) || string.Equals(s.Method, Method, StringComparison.OrdinalIgnoreCase)) &&
        (string.IsNullOrWhiteSpace(Stage) || string.Equals(s.Stage ?? "full", Stage, StringComparison.OrdinalIgnoreCase));
}
