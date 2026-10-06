using CubeTrainer.Application.Abstractions;
using CubeTrainer.Domain.Cases;
using CubeTrainer.Domain.Solves;
using Microsoft.EntityFrameworkCore;

namespace CubeTrainer.Infrastructure.Persistence.Postgres;

public sealed class PostgresSolveRepository(CubeDbContext db) : ISolveRepository
{
    public async Task<IReadOnlyList<Solve>> ListAsync(Guid userId, string? mode, string? caseId, CancellationToken ct)
    {
        IQueryable<Solve> q = db.Solves.AsNoTracking().Where(s => s.UserId == userId && s.DeletedAt == null);
        if (!string.IsNullOrEmpty(mode)) q = q.Where(s => s.Mode == mode);
        if (!string.IsNullOrEmpty(caseId)) q = q.Where(s => s.CaseId == caseId);
        return await q.OrderBy(s => s.AtMs).ThenBy(s => s.Id).ToListAsync(ct);
    }

    public async Task<int> UpsertAsync(Guid userId, IReadOnlyCollection<Solve> solves, CancellationToken ct)
    {
        // A batch may repeat an id; the last one wins.
        var batch = solves.GroupBy(s => s.Id).Select(g => g.Last()).ToList();
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                return await TryUpsertAsync(userId, batch, ct);
            }
            catch (DbUpdateException) when (attempt == 0)
            {
                // Two requests inserted the same new id at once; the second now finds the row and updates it.
                db.ChangeTracker.Clear();
            }
        }
    }

    private async Task<int> TryUpsertAsync(Guid userId, List<Solve> batch, CancellationToken ct)
    {
        var ids = batch.Select(s => s.Id).ToList();
        var existing = await db.Solves.Where(r => r.UserId == userId && ids.Contains(r.Id)).ToDictionaryAsync(r => r.Id, ct);

        var written = 0;
        foreach (var incoming in batch)
        {
            if (existing.TryGetValue(incoming.Id, out var row))
            {
                if (row.DeletedAt is not null) continue; // a delete wins over a stale device uploading the row again
                Apply(row, incoming);
            }
            else
            {
                var fresh = incoming.Copy();
                fresh.UserId = userId;
                fresh.DeletedAt = null;
                fresh.Rev = 0;
                db.Solves.Add(fresh);
            }

            written++;
        }

        await db.SaveChangesAsync(ct);
        return written;
    }

    public async Task<bool> UpdateAsync(Guid userId, Guid id, string? penalty, string[]? tags, CancellationToken ct)
    {
        var row = await db.Solves.FirstOrDefaultAsync(s => s.UserId == userId && s.Id == id && s.DeletedAt == null, ct);
        if (row is null) return false;
        if (penalty is not null) row.Penalty = penalty;
        if (tags is not null) row.Tags = tags;
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> DeleteAsync(Guid userId, Guid id, CancellationToken ct)
    {
        DateTimeOffset? now = DateTimeOffset.UtcNow;
        return await db.Solves.Where(s => s.UserId == userId && s.Id == id && s.DeletedAt == null)
            .ExecuteUpdateAsync(u => u.SetProperty(s => s.DeletedAt, now), ct) > 0;
    }

    public async Task<int> DeleteAllAsync(Guid userId, string? mode, CancellationToken ct)
    {
        DateTimeOffset? now = DateTimeOffset.UtcNow;
        IQueryable<Solve> q = db.Solves.Where(s => s.UserId == userId && s.DeletedAt == null);
        if (!string.IsNullOrEmpty(mode)) q = q.Where(s => s.Mode == mode);
        return await q.ExecuteUpdateAsync(u => u.SetProperty(s => s.DeletedAt, now), ct);
    }

    public async Task<int> PurgeTombstonesAsync(DateTimeOffset before, CancellationToken ct) =>
        await db.Solves.Where(s => s.DeletedAt != null && s.DeletedAt < before).ExecuteDeleteAsync(ct);

    public async Task<IReadOnlyList<Solve>> ChangesSinceAsync(Guid userId, long since, int limit, CancellationToken ct) =>
        await db.Solves.AsNoTracking().Where(s => s.UserId == userId && s.Rev > since).OrderBy(s => s.Rev).Take(limit).ToListAsync(ct);

    private static void Apply(Solve row, Solve src)
    {
        row.AtMs = src.AtMs;
        row.TimeMs = src.TimeMs;
        row.Penalty = src.Penalty;
        row.Scramble = src.Scramble;
        row.Mode = src.Mode;
        row.SetId = src.SetId;
        row.CaseId = src.CaseId;
        row.Auf = src.Auf;
        row.InspectionMs = src.InspectionMs;
        row.Stage = src.Stage;
        row.Cube = src.Cube;
        row.Method = src.Method;
        row.Tags = src.Tags;
    }
}

public sealed class PostgresCaseStatusRepository(CubeDbContext db) : ICaseStatusRepository
{
    public async Task<IReadOnlyDictionary<string, string>> GetAllAsync(Guid userId, CancellationToken ct) =>
        await db.CaseStatuses.AsNoTracking().Where(c => c.UserId == userId).ToDictionaryAsync(c => c.CaseId, c => c.Status, ct);

    public async Task SetAsync(Guid userId, string caseId, string status, CancellationToken ct)
    {
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                var row = await db.CaseStatuses.FirstOrDefaultAsync(c => c.UserId == userId && c.CaseId == caseId, ct);
                if (row is null) db.CaseStatuses.Add(new CaseStatusEntry { UserId = userId, CaseId = caseId, Status = status });
                else row.Status = status;
                await db.SaveChangesAsync(ct);
                return;
            }
            catch (DbUpdateException) when (attempt == 0)
            {
                db.ChangeTracker.Clear();
            }
        }
    }

    public async Task<IReadOnlyList<CaseStatusEntry>> ChangesSinceAsync(Guid userId, long since, long? upToRev, CancellationToken ct)
    {
        IQueryable<CaseStatusEntry> q = db.CaseStatuses.AsNoTracking().Where(c => c.UserId == userId && c.Rev > since);
        if (upToRev is not null) q = q.Where(c => c.Rev <= upToRev);
        return await q.OrderBy(c => c.Rev).ToListAsync(ct);
    }
}
