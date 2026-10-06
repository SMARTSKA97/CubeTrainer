using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Common;
using CubeTrainer.Domain.Solves;

namespace CubeTrainer.Application.Stats;

public sealed class StatsService(ISolveRepository solves)
{
    public async Task<Result<StatsResult>> ComputeAsync(Guid userId, string? mode, string? caseId, CancellationToken ct)
    {
        if (mode is not null && !SolveModes.IsValid(mode)) return Result<StatsResult>.Fail(ErrorKind.Validation, "invalid_mode", "mode must be 'random' or 'case'.");
        return Result<StatsResult>.Ok(StatsCalculator.Compute(await solves.ListAsync(userId, mode, caseId, ct)));
    }

    public async Task<IReadOnlyDictionary<string, StatsResult>> PerCaseAsync(Guid userId, CancellationToken ct)
    {
        var list = await solves.ListAsync(userId, SolveModes.Case, null, ct);
        return list
            .Where(s => s.CaseId is not null)
            .GroupBy(s => s.CaseId!)
            .ToDictionary(g => g.Key, g => StatsCalculator.Compute(g.ToList()));
    }
}
