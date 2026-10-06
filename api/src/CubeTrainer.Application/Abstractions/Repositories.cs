using CubeTrainer.Domain.Cases;
using CubeTrainer.Domain.Solves;
using CubeTrainer.Domain.Users;

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

public interface IUserRepository
{
    Task<AppUser?> FindByIdAsync(Guid id, CancellationToken ct);

    Task<AppUser?> FindByNormalizedEmailAsync(string normalizedEmail, CancellationToken ct);

    Task<AppUser?> FindByNormalizedHandleAsync(string normalizedHandle, CancellationToken ct);

    /// <summary>Returns false when the email or handle is already taken (unique constraint).</summary>
    Task<bool> TryCreateAsync(AppUser user, CancellationToken ct);

    /// <summary>Returns false when the new email or handle collides with another account.</summary>
    Task<bool> TryUpdateAsync(AppUser user, CancellationToken ct);

    Task DeleteAsync(Guid id, CancellationToken ct);
}

public interface IRefreshTokenRepository
{
    Task AddAsync(RefreshToken token, CancellationToken ct);

    Task<RefreshToken?> FindByHashAsync(string tokenHash, CancellationToken ct);

    /// <summary>Atomically marks the token used. Returns false when somebody else used it first.</summary>
    Task<bool> TryMarkUsedAsync(Guid id, DateTimeOffset now, CancellationToken ct);

    Task RevokeFamilyAsync(Guid familyId, DateTimeOffset now, CancellationToken ct);

    /// <param name="exceptFamilyId">Keep this session (used by "sign out everywhere else").</param>
    Task RevokeAllForUserAsync(Guid userId, Guid? exceptFamilyId, DateTimeOffset now, CancellationToken ct);

    /// <summary>One entry per active (unrevoked, unexpired) family: the newest token of each.</summary>
    Task<IReadOnlyList<RefreshToken>> ListActiveSessionsAsync(Guid userId, DateTimeOffset now, CancellationToken ct);

    Task DeleteExpiredAsync(DateTimeOffset olderThan, CancellationToken ct);
}

public interface IUserTokenRepository
{
    Task AddAsync(UserToken token, CancellationToken ct);

    Task<UserToken?> FindByHashAsync(string tokenHash, CancellationToken ct);

    /// <summary>Atomically consumes the token. Returns false when it was already used.</summary>
    Task<bool> TryMarkUsedAsync(Guid id, DateTimeOffset now, CancellationToken ct);

    /// <summary>Invalidates older unused tokens of a purpose so only the newest email works.</summary>
    Task InvalidateAsync(Guid userId, string purpose, DateTimeOffset now, CancellationToken ct);
}
