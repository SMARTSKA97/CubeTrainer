using CubeTrainer.Application.Abstractions;
using CubeTrainer.Domain.Cases;
using CubeTrainer.Domain.Solves;

namespace CubeTrainer.Infrastructure.Persistence.InMemory;

/// <summary>Revision counter shared by both in-memory stores, mirroring the database sequence.</summary>
internal sealed class RevisionCounter
{
    private long _value;

    public long Next() => Interlocked.Increment(ref _value);
}

/// <summary>Non-persistent store for local development and tests. Never used in production.</summary>
public sealed class InMemorySolveRepository : ISolveRepository
{
    private readonly object _gate = new();
    private readonly Dictionary<(Guid User, Guid Id), Solve> _solves = [];
    private static readonly RevisionCounter Revs = new();

    public Task<IReadOnlyList<Solve>> ListAsync(Guid userId, string? mode, string? caseId, CancellationToken ct)
    {
        lock (_gate)
        {
            var q = _solves.Values.Where(s => s.UserId == userId && s.DeletedAt is null);
            if (!string.IsNullOrEmpty(mode)) q = q.Where(s => s.Mode == mode);
            if (!string.IsNullOrEmpty(caseId)) q = q.Where(s => s.CaseId == caseId);
            IReadOnlyList<Solve> result = q.OrderBy(s => s.AtMs).ThenBy(s => s.Id).Select(s => s.Copy()).ToList();
            return Task.FromResult(result);
        }
    }

    public Task<int> UpsertAsync(Guid userId, IReadOnlyCollection<Solve> solves, CancellationToken ct)
    {
        lock (_gate)
        {
            var written = 0;
            foreach (var incoming in solves)
            {
                var key = (userId, incoming.Id);
                if (_solves.TryGetValue(key, out var existing) && existing.DeletedAt is not null) continue; // tombstone wins
                var row = incoming.Copy();
                row.UserId = userId;
                row.DeletedAt = null;
                row.Rev = Revs.Next();
                _solves[key] = row;
                written++;
            }

            return Task.FromResult(written);
        }
    }

    public Task<bool> UpdateAsync(Guid userId, Guid id, string? penalty, string[]? tags, CancellationToken ct)
    {
        lock (_gate)
        {
            if (!_solves.TryGetValue((userId, id), out var s) || s.DeletedAt is not null) return Task.FromResult(false);
            if (penalty is not null) s.Penalty = penalty;
            if (tags is not null) s.Tags = [.. tags];
            s.Rev = Revs.Next();
            return Task.FromResult(true);
        }
    }

    public Task<bool> DeleteAsync(Guid userId, Guid id, CancellationToken ct)
    {
        lock (_gate)
        {
            if (!_solves.TryGetValue((userId, id), out var s) || s.DeletedAt is not null) return Task.FromResult(false);
            s.DeletedAt = DateTimeOffset.UtcNow;
            s.Rev = Revs.Next();
            return Task.FromResult(true);
        }
    }

    public Task<int> DeleteAllAsync(Guid userId, string? mode, CancellationToken ct)
    {
        lock (_gate)
        {
            var rows = _solves.Values.Where(s => s.UserId == userId && s.DeletedAt is null && (string.IsNullOrEmpty(mode) || s.Mode == mode)).ToList();
            foreach (var s in rows)
            {
                s.DeletedAt = DateTimeOffset.UtcNow;
                s.Rev = Revs.Next();
            }

            return Task.FromResult(rows.Count);
        }
    }

    public Task<int> PurgeTombstonesAsync(DateTimeOffset before, CancellationToken ct)
    {
        lock (_gate)
        {
            var keys = _solves.Where(kv => kv.Value.DeletedAt < before).Select(kv => kv.Key).ToList();
            foreach (var k in keys) _solves.Remove(k);
            return Task.FromResult(keys.Count);
        }
    }

    public Task<IReadOnlyList<Solve>> ChangesSinceAsync(Guid userId, long since, int limit, CancellationToken ct)
    {
        lock (_gate)
        {
            IReadOnlyList<Solve> result = _solves.Values.Where(s => s.UserId == userId && s.Rev > since).OrderBy(s => s.Rev).Take(limit).Select(s => s.Copy()).ToList();
            return Task.FromResult(result);
        }
    }
}

public sealed class InMemoryCaseStatusRepository : ICaseStatusRepository
{
    private readonly object _gate = new();
    private readonly Dictionary<(Guid User, string Case), CaseStatusEntry> _status = [];
    private static readonly RevisionCounter Revs = new();

    public Task<IReadOnlyDictionary<string, string>> GetAllAsync(Guid userId, CancellationToken ct)
    {
        lock (_gate)
            return Task.FromResult<IReadOnlyDictionary<string, string>>(_status.Values.Where(c => c.UserId == userId).ToDictionary(c => c.CaseId, c => c.Status));
    }

    public Task SetAsync(Guid userId, string caseId, string status, CancellationToken ct)
    {
        lock (_gate) _status[(userId, caseId)] = new CaseStatusEntry { UserId = userId, CaseId = caseId, Status = status, Rev = Revs.Next() };
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<CaseStatusEntry>> ChangesSinceAsync(Guid userId, long since, long? upToRev, CancellationToken ct)
    {
        lock (_gate)
        {
            IReadOnlyList<CaseStatusEntry> result = _status.Values
                .Where(c => c.UserId == userId && c.Rev > since && (upToRev is null || c.Rev <= upToRev))
                .OrderBy(c => c.Rev)
                .Select(c => new CaseStatusEntry { UserId = c.UserId, CaseId = c.CaseId, Status = c.Status, Rev = c.Rev })
                .ToList();
            return Task.FromResult(result);
        }
    }
}
