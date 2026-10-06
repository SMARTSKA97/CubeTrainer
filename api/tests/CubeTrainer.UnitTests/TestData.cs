using CubeTrainer.Domain.Solves;

namespace CubeTrainer.UnitTests;

internal static class TestData
{
    public static Solve Solve(int timeMs, string penalty = Penalties.None, long atMs = 1_700_000_000_000, string mode = SolveModes.Random, string? caseId = null) => new()
    {
        Id = Guid.NewGuid(),
        AtMs = atMs,
        TimeMs = timeMs,
        Penalty = penalty,
        Scramble = "R U R' U'",
        Mode = mode,
        CaseId = caseId,
    };

    public static List<Solve> Series(params int[] times) => times.Select((t, i) => Solve(t, atMs: 1_700_000_000_000 + i)).ToList();
}
