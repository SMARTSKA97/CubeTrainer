using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Common;
using CubeTrainer.Domain.Cases;

namespace CubeTrainer.Application.Cases;

public sealed class CaseStatusService(ICaseStatusRepository statuses)
{
    public const int MaxCaseIdLength = 64;

    public Task<IReadOnlyDictionary<string, string>> GetAllAsync(CancellationToken ct) => statuses.GetAllAsync(ct);

    public async Task<Result<Unit>> SetAsync(string caseId, string? status, CancellationToken ct)
    {
        if (!CaseStatuses.IsValid(status)) return Result<Unit>.Fail(ErrorKind.Validation, "invalid_status", "status must be 'unlearned', 'learning' or 'finished'.");
        if (string.IsNullOrWhiteSpace(caseId) || caseId.Length > MaxCaseIdLength) return Result<Unit>.Fail(ErrorKind.Validation, "invalid_case_id", "Invalid case id.");
        await statuses.SetAsync(caseId, status!, ct);
        return Result<Unit>.Ok(Unit.Value);
    }
}
