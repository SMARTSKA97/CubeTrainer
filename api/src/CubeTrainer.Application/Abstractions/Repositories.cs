using CubeTrainer.Domain.Users;

namespace CubeTrainer.Application.Abstractions;

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

public interface IExternalLoginRepository
{
    Task<ExternalLogin?> FindAsync(string provider, string subject, CancellationToken ct);

    Task<IReadOnlyList<ExternalLogin>> ListForUserAsync(Guid userId, CancellationToken ct);

    /// <summary>False when this provider account (or this provider for this user) is already linked somewhere.</summary>
    Task<bool> TryAddAsync(ExternalLogin login, CancellationToken ct);

    Task<bool> DeleteAsync(Guid userId, string provider, CancellationToken ct);
}

public interface IRecoveryCodeRepository
{
    /// <summary>Replaces every code of the user with this new set (old ones stop working).</summary>
    Task ReplaceAllAsync(Guid userId, IReadOnlyList<string> codeHashes, DateTimeOffset now, CancellationToken ct);

    /// <summary>Atomically spends a code. False when it is unknown or already used.</summary>
    Task<bool> TryUseAsync(Guid userId, string codeHash, DateTimeOffset now, CancellationToken ct);

    Task<int> CountUnusedAsync(Guid userId, CancellationToken ct);

    Task DeleteAllAsync(Guid userId, CancellationToken ct);
}
