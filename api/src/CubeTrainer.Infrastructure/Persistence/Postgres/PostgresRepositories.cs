using CubeTrainer.Application.Abstractions;
using CubeTrainer.Domain.Cases;
using CubeTrainer.Domain.Solves;
using Microsoft.EntityFrameworkCore;

namespace CubeTrainer.Infrastructure.Persistence.Postgres;

public sealed class PostgresSolveRepository(CubeDbContext db) : ISolveRepository
{
    public async Task<IReadOnlyList<Solve>> ListAsync(string? mode, string? caseId, CancellationToken ct)
    {
        IQueryable<Solve> q = db.Solves.AsNoTracking();
        if (!string.IsNullOrEmpty(mode)) q = q.Where(s => s.Mode == mode);
        if (!string.IsNullOrEmpty(caseId)) q = q.Where(s => s.CaseId == caseId);
        return await q.OrderBy(s => s.AtMs).ThenBy(s => s.Id).ToListAsync(ct);
    }

    public async Task UpsertAsync(IReadOnlyCollection<Solve> solves, CancellationToken ct)
    {
        // A batch may repeat an id; the last one wins.
        var batch = solves.GroupBy(s => s.Id).Select(g => g.Last()).ToList();
        var ids = batch.Select(s => s.Id).ToList();
        var existing = await db.Solves.Where(r => ids.Contains(r.Id)).ToDictionaryAsync(r => r.Id, ct);

        foreach (var dto in batch)
        {
            if (existing.TryGetValue(dto.Id, out var row)) Apply(row, dto);
            else db.Solves.Add(dto.Copy());
        }

        await db.SaveChangesAsync(ct);
    }

    public async Task<bool> UpdateAsync(Guid id, string? penalty, string[]? tags, CancellationToken ct)
    {
        var row = await db.Solves.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (row is null) return false;
        if (penalty is not null) row.Penalty = penalty;
        if (tags is not null) row.Tags = tags;
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct) =>
        await db.Solves.Where(s => s.Id == id).ExecuteDeleteAsync(ct) > 0;

    public async Task<int> DeleteAllAsync(string? mode, CancellationToken ct)
    {
        IQueryable<Solve> q = db.Solves;
        if (!string.IsNullOrEmpty(mode)) q = q.Where(s => s.Mode == mode);
        return await q.ExecuteDeleteAsync(ct);
    }

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
        row.Tags = src.Tags;
    }
}

public sealed class PostgresCaseStatusRepository(CubeDbContext db) : ICaseStatusRepository
{
    public async Task<IReadOnlyDictionary<string, string>> GetAllAsync(CancellationToken ct) =>
        await db.CaseStatuses.AsNoTracking().ToDictionaryAsync(c => c.CaseId, c => c.Status, ct);

    public async Task SetAsync(string caseId, string status, CancellationToken ct)
    {
        var row = await db.CaseStatuses.FirstOrDefaultAsync(c => c.CaseId == caseId, ct);
        if (row is null) db.CaseStatuses.Add(new CaseStatusEntry { CaseId = caseId, Status = status });
        else row.Status = status;
        await db.SaveChangesAsync(ct);
    }
}
