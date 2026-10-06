using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Common;
using CubeTrainer.Domain.Solves;

namespace CubeTrainer.Application.Stats;

public sealed class StatsService(ISolveRepository solves)
{
    public async Task<Result<StatsResult>> ComputeAsync(Guid userId, string? mode, string? caseId, CancellationToken ct, StatsFilter? filter = null)
    {
        if (mode is not null && !SolveModes.IsValid(mode)) return Result<StatsResult>.Fail(ErrorKind.Validation, "invalid_mode", "mode must be 'random' or 'case'.");
        if (filter is { FromMs: { } from, ToMs: { } to } && from > to) return Result<StatsResult>.Fail(ErrorKind.Validation, "invalid_range", "'from' must not be after 'to'.");
        var list = await solves.ListAsync(userId, mode, caseId, ct);
        return Result<StatsResult>.Ok(StatsCalculator.Compute(filter is null ? list : filter.Apply(list)));
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
