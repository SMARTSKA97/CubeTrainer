using CubeTrainer.Domain.Cases;
using CubeTrainer.Domain.Solves;

namespace CubeTrainer.Application.Abstractions;

public interface ISolveRepository
{
    /// <summary>Solves ordered oldest to newest.</summary>
    Task<IReadOnlyList<Solve>> ListAsync(string? mode, string? caseId, CancellationToken ct);

    /// <summary>Insert, or overwrite when the id already exists (clients retry and re-sync).</summary>
    Task UpsertAsync(IReadOnlyCollection<Solve> solves, CancellationToken ct);

    /// <summary>Change the penalty and/or the tags (null = unchanged). False when the id is unknown.</summary>
    Task<bool> UpdateAsync(Guid id, string? penalty, string[]? tags, CancellationToken ct);

    Task<bool> DeleteAsync(Guid id, CancellationToken ct);

    /// <summary>Delete every solve, or only those of one mode. Returns how many were removed.</summary>
    Task<int> DeleteAllAsync(string? mode, CancellationToken ct);
}

public interface ICaseStatusRepository
{
    Task<IReadOnlyDictionary<string, string>> GetAllAsync(CancellationToken ct);

    Task SetAsync(string caseId, string status, CancellationToken ct);
}
