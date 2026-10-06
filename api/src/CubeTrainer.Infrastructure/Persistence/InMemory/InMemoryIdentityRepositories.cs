using CubeTrainer.Application.Abstractions;
using CubeTrainer.Domain.Users;

namespace CubeTrainer.Infrastructure.Persistence.InMemory;

public sealed class InMemoryUserRepository : IUserRepository
{
    private readonly object _gate = new();
    private readonly Dictionary<Guid, AppUser> _users = [];

    public Task<AppUser?> FindByIdAsync(Guid id, CancellationToken ct)
    {
        lock (_gate) return Task.FromResult(_users.TryGetValue(id, out var u) ? u.Copy() : null);
    }

    public Task<AppUser?> FindByNormalizedEmailAsync(string normalizedEmail, CancellationToken ct)
    {
        lock (_gate) return Task.FromResult(_users.Values.FirstOrDefault(u => u.NormalizedEmail == normalizedEmail)?.Copy());
    }

    public Task<AppUser?> FindByNormalizedHandleAsync(string normalizedHandle, CancellationToken ct)
    {
        lock (_gate) return Task.FromResult(_users.Values.FirstOrDefault(u => u.NormalizedHandle == normalizedHandle)?.Copy());
    }

    public Task<bool> TryCreateAsync(AppUser user, CancellationToken ct)
    {
        lock (_gate)
        {
            if (_users.Values.Any(u => u.NormalizedEmail == user.NormalizedEmail || u.NormalizedHandle == user.NormalizedHandle)) return Task.FromResult(false);
            _users[user.Id] = user.Copy();
            return Task.FromResult(true);
        }
    }

    public Task<bool> TryUpdateAsync(AppUser user, CancellationToken ct)
    {
        lock (_gate)
        {
            if (_users.Values.Any(u => u.Id != user.Id && (u.NormalizedEmail == user.NormalizedEmail || u.NormalizedHandle == user.NormalizedHandle))) return Task.FromResult(false);
            _users[user.Id] = user.Copy();
            return Task.FromResult(true);
        }
    }

    public Task DeleteAsync(Guid id, CancellationToken ct)
    {
        lock (_gate) _users.Remove(id);
        return Task.CompletedTask;
    }
}

/// <summary>Refresh tokens and email tokens in memory; deleting a user cascades like the database does.</summary>
public sealed class InMemoryRefreshTokenRepository : IRefreshTokenRepository
{
    private readonly object _gate = new();
    private readonly List<RefreshToken> _tokens = [];

    public Task AddAsync(RefreshToken token, CancellationToken ct)
    {
        lock (_gate) _tokens.Add(token.Copy());
        return Task.CompletedTask;
    }

    public Task<RefreshToken?> FindByHashAsync(string tokenHash, CancellationToken ct)
    {
        lock (_gate) return Task.FromResult(_tokens.FirstOrDefault(t => t.TokenHash == tokenHash)?.Copy());
    }

    public Task<bool> TryMarkUsedAsync(Guid id, DateTimeOffset now, CancellationToken ct)
    {
        lock (_gate)
        {
            var t = _tokens.FirstOrDefault(x => x.Id == id);
            if (t is null || t.UsedAt is not null) return Task.FromResult(false);
            t.UsedAt = now;
            return Task.FromResult(true);
        }
    }

    public Task RevokeFamilyAsync(Guid familyId, DateTimeOffset now, CancellationToken ct)
    {
        lock (_gate)
        {
            foreach (var t in _tokens.Where(x => x.FamilyId == familyId && x.RevokedAt is null)) t.RevokedAt = now;
        }

        return Task.CompletedTask;
    }

    public Task RevokeAllForUserAsync(Guid userId, Guid? exceptFamilyId, DateTimeOffset now, CancellationToken ct)
    {
        lock (_gate)
        {
            foreach (var t in _tokens.Where(x => x.UserId == userId && x.FamilyId != exceptFamilyId && x.RevokedAt is null)) t.RevokedAt = now;
        }

        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<RefreshToken>> ListActiveSessionsAsync(Guid userId, DateTimeOffset now, CancellationToken ct)
    {
        lock (_gate)
        {
            IReadOnlyList<RefreshToken> result = _tokens
                .Where(t => t.UserId == userId && t.RevokedAt is null && t.FamilyExpiresAt > now)
                .GroupBy(t => t.FamilyId)
                .Select(g => g.OrderByDescending(t => t.CreatedAt).First().Copy())
                .ToList();
            return Task.FromResult(result);
        }
    }

    public Task DeleteExpiredAsync(DateTimeOffset olderThan, CancellationToken ct)
    {
        lock (_gate) _tokens.RemoveAll(t => t.ExpiresAt < olderThan);
        return Task.CompletedTask;
    }
}

public sealed class InMemoryUserTokenRepository : IUserTokenRepository
{
    private readonly object _gate = new();
    private readonly List<UserToken> _tokens = [];

    public Task AddAsync(UserToken token, CancellationToken ct)
    {
        lock (_gate) _tokens.Add(token.Copy());
        return Task.CompletedTask;
    }

    public Task<UserToken?> FindByHashAsync(string tokenHash, CancellationToken ct)
    {
        lock (_gate) return Task.FromResult(_tokens.FirstOrDefault(t => t.TokenHash == tokenHash)?.Copy());
    }

    public Task<bool> TryMarkUsedAsync(Guid id, DateTimeOffset now, CancellationToken ct)
    {
        lock (_gate)
        {
            var t = _tokens.FirstOrDefault(x => x.Id == id);
            if (t is null || t.UsedAt is not null) return Task.FromResult(false);
            t.UsedAt = now;
            return Task.FromResult(true);
        }
    }

    public Task InvalidateAsync(Guid userId, string purpose, DateTimeOffset now, CancellationToken ct)
    {
        lock (_gate)
        {
            foreach (var t in _tokens.Where(x => x.UserId == userId && x.Purpose == purpose && x.UsedAt is null)) t.UsedAt = now;
        }

        return Task.CompletedTask;
    }
}

public sealed class InMemoryExternalLoginRepository : IExternalLoginRepository
{
    private readonly object _gate = new();
    private readonly List<ExternalLogin> _logins = [];

    public Task<ExternalLogin?> FindAsync(string provider, string subject, CancellationToken ct)
    {
        lock (_gate) return Task.FromResult(_logins.FirstOrDefault(l => l.Provider == provider && l.Subject == subject));
    }

    public Task<IReadOnlyList<ExternalLogin>> ListForUserAsync(Guid userId, CancellationToken ct)
    {
        lock (_gate) return Task.FromResult<IReadOnlyList<ExternalLogin>>(_logins.Where(l => l.UserId == userId).OrderBy(l => l.CreatedAt).ToList());
    }

    public Task<bool> TryAddAsync(ExternalLogin login, CancellationToken ct)
    {
        lock (_gate)
        {
            if (_logins.Any(l => (l.Provider == login.Provider && l.Subject == login.Subject) || (l.UserId == login.UserId && l.Provider == login.Provider))) return Task.FromResult(false);
            _logins.Add(login);
            return Task.FromResult(true);
        }
    }

    public Task<bool> DeleteAsync(Guid userId, string provider, CancellationToken ct)
    {
        lock (_gate) return Task.FromResult(_logins.RemoveAll(l => l.UserId == userId && l.Provider == provider) > 0);
    }
}

public sealed class InMemoryRecoveryCodeRepository : IRecoveryCodeRepository
{
    private readonly object _gate = new();
    private readonly List<RecoveryCode> _codes = [];

    public Task ReplaceAllAsync(Guid userId, IReadOnlyList<string> codeHashes, DateTimeOffset now, CancellationToken ct)
    {
        lock (_gate)
        {
            _codes.RemoveAll(c => c.UserId == userId);
            _codes.AddRange(codeHashes.Select(h => new RecoveryCode { Id = Guid.CreateVersion7(), UserId = userId, CodeHash = h, CreatedAt = now }));
        }

        return Task.CompletedTask;
    }

    public Task<bool> TryUseAsync(Guid userId, string codeHash, DateTimeOffset now, CancellationToken ct)
    {
        lock (_gate)
        {
            var code = _codes.FirstOrDefault(c => c.UserId == userId && c.CodeHash == codeHash && c.UsedAt is null);
            if (code is null) return Task.FromResult(false);
            code.UsedAt = now;
            return Task.FromResult(true);
        }
    }

    public Task<int> CountUnusedAsync(Guid userId, CancellationToken ct)
    {
        lock (_gate) return Task.FromResult(_codes.Count(c => c.UserId == userId && c.UsedAt is null));
    }

    public Task DeleteAllAsync(Guid userId, CancellationToken ct)
    {
        lock (_gate) _codes.RemoveAll(c => c.UserId == userId);
        return Task.CompletedTask;
    }
}
