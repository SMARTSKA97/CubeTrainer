using CubeTrainer.Domain.Cases;
using CubeTrainer.Domain.Solves;

namespace CubeTrainer.Application.Abstractions;

/// <summary>Every method is scoped to one user: a repository never returns or touches another account's rows.</summary>
public interface ISolveRepository
{
    /// <summary>The user's live (not deleted) solves, oldest to newest.</summary>
    Task<IReadOnlyList<Solve>> ListAsync(Guid userId, string? mode, string? caseId, CancellationToken ct);

    /// <summary>
    /// Insert, or overwrite when the id already exists (clients retry and re-sync). A solve that was deleted stays deleted:
    /// an old device re-uploading it must not bring it back. Returns how many rows were written.
    /// </summary>
    Task<int> UpsertAsync(Guid userId, IReadOnlyCollection<Solve> solves, CancellationToken ct);

    /// <summary>Change the penalty and/or the tags (null = unchanged). False when the id is unknown or deleted.</summary>
    Task<bool> UpdateAsync(Guid userId, Guid id, string? penalty, string[]? tags, CancellationToken ct);

    Task<bool> DeleteAsync(Guid userId, Guid id, CancellationToken ct);

    /// <summary>Delete every solve, or only those of one mode. Returns how many were removed.</summary>
    Task<int> DeleteAllAsync(Guid userId, string? mode, CancellationToken ct);

    /// <summary>Rows (including tombstones) with Rev greater than <paramref name="since"/>, oldest change first.</summary>
    Task<IReadOnlyList<Solve>> ChangesSinceAsync(Guid userId, long since, int limit, CancellationToken ct);
}

public interface ICaseStatusRepository
{
    Task<IReadOnlyDictionary<string, string>> GetAllAsync(Guid userId, CancellationToken ct);

    Task SetAsync(Guid userId, string caseId, string status, CancellationToken ct);

    /// <summary>Statuses changed after <paramref name="since"/> and up to <paramref name="upToRev"/> (null = no upper bound).</summary>
    Task<IReadOnlyList<CaseStatusEntry>> ChangesSinceAsync(Guid userId, long since, long? upToRev, CancellationToken ct);
}
