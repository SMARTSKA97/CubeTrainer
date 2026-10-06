using CubeTrainer.Application.Abstractions;
using CubeTrainer.Domain.Solves;

namespace CubeTrainer.Infrastructure.Persistence.InMemory;

/// <summary>Non-persistent store for local development and tests. Never used in production.</summary>
public sealed class InMemorySolveRepository : ISolveRepository
{
    private readonly object _gate = new();
    private readonly Dictionary<Guid, Solve> _solves = [];

    public Task<IReadOnlyList<Solve>> ListAsync(string? mode, string? caseId, CancellationToken ct)
    {
        lock (_gate)
        {
            var q = _solves.Values.AsEnumerable();
            if (!string.IsNullOrEmpty(mode)) q = q.Where(s => s.Mode == mode);
            if (!string.IsNullOrEmpty(caseId)) q = q.Where(s => s.CaseId == caseId);
            IReadOnlyList<Solve> result = q.OrderBy(s => s.AtMs).ThenBy(s => s.Id).Select(s => s.Copy()).ToList();
            return Task.FromResult(result);
        }
    }

    public Task UpsertAsync(IReadOnlyCollection<Solve> solves, CancellationToken ct)
    {
        lock (_gate)
        {
            foreach (var s in solves) _solves[s.Id] = s.Copy();
        }

        return Task.CompletedTask;
    }

    public Task<bool> UpdateAsync(Guid id, string? penalty, string[]? tags, CancellationToken ct)
    {
        lock (_gate)
        {
            if (!_solves.TryGetValue(id, out var s)) return Task.FromResult(false);
            if (penalty is not null) s.Penalty = penalty;
            if (tags is not null) s.Tags = [.. tags];
            return Task.FromResult(true);
        }
    }

    public Task<bool> DeleteAsync(Guid id, CancellationToken ct)
    {
        lock (_gate) return Task.FromResult(_solves.Remove(id));
    }

    public Task<int> DeleteAllAsync(string? mode, CancellationToken ct)
    {
        lock (_gate)
        {
            var ids = _solves.Values.Where(s => string.IsNullOrEmpty(mode) || s.Mode == mode).Select(s => s.Id).ToList();
            foreach (var id in ids) _solves.Remove(id);
            return Task.FromResult(ids.Count);
        }
    }
}

public sealed class InMemoryCaseStatusRepository : ICaseStatusRepository
{
    private readonly object _gate = new();
    private readonly Dictionary<string, string> _status = [];

    public Task<IReadOnlyDictionary<string, string>> GetAllAsync(CancellationToken ct)
    {
        lock (_gate) return Task.FromResult<IReadOnlyDictionary<string, string>>(new Dictionary<string, string>(_status));
    }

    public Task SetAsync(string caseId, string status, CancellationToken ct)
    {
        lock (_gate) _status[caseId] = status;
        return Task.CompletedTask;
    }
}
