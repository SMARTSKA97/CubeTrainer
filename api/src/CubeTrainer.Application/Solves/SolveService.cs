using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Common;
using CubeTrainer.Domain.Solves;

namespace CubeTrainer.Application.Solves;

public sealed class SolveService(ISolveRepository solves)
{
    public const int MaxBulk = 5000;

    public async Task<Result<IReadOnlyList<Solve>>> ListAsync(Guid userId, string? mode, string? caseId, CancellationToken ct)
    {
        if (mode is not null && !SolveModes.IsValid(mode)) return Result<IReadOnlyList<Solve>>.Fail(ErrorKind.Validation, "invalid_mode", "mode must be 'random' or 'case'.");
        return Result<IReadOnlyList<Solve>>.Ok(await solves.ListAsync(userId, mode, caseId, ct));
    }

    public async Task<Result<int>> UpsertAsync(Guid userId, IReadOnlyCollection<Solve> batch, CancellationToken ct)
    {
        if (batch.Count > MaxBulk) return Result<int>.Fail(ErrorKind.Validation, "too_many", $"At most {MaxBulk} solves per request.");
        var index = 0;
        foreach (var s in batch)
        {
            var error = SolveValidator.Validate(s);
            if (error is not null) return Result<int>.Fail(ErrorKind.Validation, "invalid_solve", batch.Count == 1 ? error : $"solves[{index}]: {error}");
            index++;
        }

        return Result<int>.Ok(await solves.UpsertAsync(userId, batch, ct));
    }

    public async Task<Result<Unit>> UpdateAsync(Guid userId, Guid id, string? penalty, string[]? tags, CancellationToken ct)
    {
        if (penalty is null && tags is null) return Result<Unit>.Fail(ErrorKind.Validation, "nothing_to_update", "Send 'penalty' and/or 'tags'.");
        if (penalty is not null && !Penalties.IsValid(penalty)) return Result<Unit>.Fail(ErrorKind.Validation, "invalid_penalty", "penalty must be 'none', 'plus2' or 'dnf'.");
        var tagError = SolveValidator.ValidateTags(tags);
        if (tagError is not null) return Result<Unit>.Fail(ErrorKind.Validation, "invalid_tags", tagError);
        return await solves.UpdateAsync(userId, id, penalty, tags, ct)
            ? Result<Unit>.Ok(Unit.Value)
            : Result<Unit>.Fail(ErrorKind.NotFound, "solve_not_found", "No solve with that id.");
    }

    public async Task<Result<Unit>> DeleteAsync(Guid userId, Guid id, CancellationToken ct) =>
        await solves.DeleteAsync(userId, id, ct)
            ? Result<Unit>.Ok(Unit.Value)
            : Result<Unit>.Fail(ErrorKind.NotFound, "solve_not_found", "No solve with that id.");

    public async Task<Result<int>> DeleteAllAsync(Guid userId, string? mode, CancellationToken ct)
    {
        if (mode is not null && !SolveModes.IsValid(mode)) return Result<int>.Fail(ErrorKind.Validation, "invalid_mode", "mode must be 'random' or 'case'.");
        return Result<int>.Ok(await solves.DeleteAllAsync(userId, mode, ct));
    }
}
