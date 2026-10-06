using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Common;
using CubeTrainer.Domain.Cases;
using CubeTrainer.Domain.Solves;

namespace CubeTrainer.Application.Sync;

/// <param name="Cursor">Pass this back as <c>since</c> to get the next page, or later changes once <paramref name="HasMore"/> is false.</param>
public sealed record SyncChanges(long Cursor, bool HasMore, IReadOnlyList<Solve> Solves, IReadOnlyList<CaseStatusEntry> CaseStatuses);

/// <summary>
/// Delta sync: "everything that changed after revision N". Solves page by revision; the (small) case-status list rides along,
/// limited to the revisions the solve page covers so one cursor describes both.
/// </summary>
public sealed class SyncService(ISolveRepository solves, ICaseStatusRepository statuses)
{
    public const int DefaultLimit = 1000;
    public const int MaxLimit = 5000;

    public async Task<Result<SyncChanges>> ChangesAsync(Guid userId, long since, int? limit, CancellationToken ct)
    {
        if (since < 0) return Result<SyncChanges>.Fail(ErrorKind.Validation, "invalid_cursor", "since must be 0 or a cursor returned earlier.");
        var take = Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);

        var page = await solves.ChangesSinceAsync(userId, since, take + 1, ct);
        var hasMore = page.Count > take;
        var shown = hasMore ? page.Take(take).ToList() : page.ToList();

        long cursor;
        IReadOnlyList<CaseStatusEntry> changedStatuses;
        if (hasMore)
        {
            cursor = shown[^1].Rev;
            changedStatuses = await statuses.ChangesSinceAsync(userId, since, cursor, ct);
        }
        else
        {
            changedStatuses = await statuses.ChangesSinceAsync(userId, since, null, ct);
            cursor = Math.Max(since, Math.Max(shown.Count == 0 ? 0 : shown[^1].Rev, changedStatuses.Count == 0 ? 0 : changedStatuses.Max(c => c.Rev)));
        }

        return Result<SyncChanges>.Ok(new SyncChanges(cursor, hasMore, shown, changedStatuses));
    }
}
