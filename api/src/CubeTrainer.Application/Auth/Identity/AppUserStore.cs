using CubeTrainer.Application.Abstractions;
using CubeTrainer.Domain.Users;
using Microsoft.AspNetCore.Identity;

namespace CubeTrainer.Application.Auth.Identity;

/// <summary>
/// Plugs our users table into ASP.NET Core Identity's UserManager (password hashing and validation, lockout,
/// email/username uniqueness) without the Identity EF Core package, so the schema stays owned by Flyway.
/// UserName maps to the public handle.
/// </summary>
public sealed class AppUserStore(IUserRepository users) :
    IUserPasswordStore<AppUser>,
    IUserEmailStore<AppUser>,
    IUserLockoutStore<AppUser>,
    IUserSecurityStampStore<AppUser>
{
    public void Dispose()
    {
    }

    // ---- IUserStore
    public Task<string> GetUserIdAsync(AppUser user, CancellationToken ct) => Task.FromResult(user.Id.ToString());

    public Task<string?> GetUserNameAsync(AppUser user, CancellationToken ct) => Task.FromResult<string?>(user.Handle);

    public Task SetUserNameAsync(AppUser user, string? userName, CancellationToken ct)
    {
        user.Handle = userName ?? string.Empty;
        return Task.CompletedTask;
    }

    public Task<string?> GetNormalizedUserNameAsync(AppUser user, CancellationToken ct) => Task.FromResult<string?>(user.NormalizedHandle);

    public Task SetNormalizedUserNameAsync(AppUser user, string? normalizedName, CancellationToken ct)
    {
        user.NormalizedHandle = normalizedName ?? string.Empty;
        return Task.CompletedTask;
    }

    public async Task<IdentityResult> CreateAsync(AppUser user, CancellationToken ct) =>
        await users.TryCreateAsync(user, ct)
            ? IdentityResult.Success
            : IdentityResult.Failed(new IdentityError { Code = "DuplicateUser", Description = "Email or username is already taken." });

    public async Task<IdentityResult> UpdateAsync(AppUser user, CancellationToken ct)
    {
        user.UpdatedAt = DateTimeOffset.UtcNow;
        return await users.TryUpdateAsync(user, ct)
            ? IdentityResult.Success
            : IdentityResult.Failed(new IdentityError { Code = "DuplicateUser", Description = "Email or username is already taken." });
    }

    public async Task<IdentityResult> DeleteAsync(AppUser user, CancellationToken ct)
    {
        await users.DeleteAsync(user.Id, ct);
        return IdentityResult.Success;
    }

    public Task<AppUser?> FindByIdAsync(string userId, CancellationToken ct) =>
        Guid.TryParse(userId, out var id) ? users.FindByIdAsync(id, ct) : Task.FromResult<AppUser?>(null);

    public Task<AppUser?> FindByNameAsync(string normalizedUserName, CancellationToken ct) =>
        users.FindByNormalizedHandleAsync(normalizedUserName, ct);

    // ---- IUserPasswordStore
    public Task SetPasswordHashAsync(AppUser user, string? passwordHash, CancellationToken ct)
    {
        user.PasswordHash = passwordHash;
        return Task.CompletedTask;
    }

    public Task<string?> GetPasswordHashAsync(AppUser user, CancellationToken ct) => Task.FromResult(user.PasswordHash);

    public Task<bool> HasPasswordAsync(AppUser user, CancellationToken ct) => Task.FromResult(user.PasswordHash is not null);

    // ---- IUserEmailStore
    public Task SetEmailAsync(AppUser user, string? email, CancellationToken ct)
    {
        user.Email = email ?? string.Empty;
        return Task.CompletedTask;
    }

    public Task<string?> GetEmailAsync(AppUser user, CancellationToken ct) => Task.FromResult<string?>(user.Email);

    public Task<bool> GetEmailConfirmedAsync(AppUser user, CancellationToken ct) => Task.FromResult(user.EmailConfirmed);

    public Task SetEmailConfirmedAsync(AppUser user, bool confirmed, CancellationToken ct)
    {
        user.EmailConfirmed = confirmed;
        return Task.CompletedTask;
    }

    public Task<AppUser?> FindByEmailAsync(string normalizedEmail, CancellationToken ct) =>
        users.FindByNormalizedEmailAsync(normalizedEmail, ct);

    public Task<string?> GetNormalizedEmailAsync(AppUser user, CancellationToken ct) => Task.FromResult<string?>(user.NormalizedEmail);

    public Task SetNormalizedEmailAsync(AppUser user, string? normalizedEmail, CancellationToken ct)
    {
        user.NormalizedEmail = normalizedEmail ?? string.Empty;
        return Task.CompletedTask;
    }

    // ---- IUserLockoutStore
    public Task<DateTimeOffset?> GetLockoutEndDateAsync(AppUser user, CancellationToken ct) => Task.FromResult(user.LockoutEnd);

    public Task SetLockoutEndDateAsync(AppUser user, DateTimeOffset? lockoutEnd, CancellationToken ct)
    {
        user.LockoutEnd = lockoutEnd;
        return Task.CompletedTask;
    }

    public Task<int> IncrementAccessFailedCountAsync(AppUser user, CancellationToken ct) => Task.FromResult(++user.AccessFailedCount);

    public Task ResetAccessFailedCountAsync(AppUser user, CancellationToken ct)
    {
        user.AccessFailedCount = 0;
        return Task.CompletedTask;
    }

    public Task<int> GetAccessFailedCountAsync(AppUser user, CancellationToken ct) => Task.FromResult(user.AccessFailedCount);

    public Task<bool> GetLockoutEnabledAsync(AppUser user, CancellationToken ct) => Task.FromResult(user.LockoutEnabled);

    public Task SetLockoutEnabledAsync(AppUser user, bool enabled, CancellationToken ct)
    {
        user.LockoutEnabled = enabled;
        return Task.CompletedTask;
    }

    // ---- IUserSecurityStampStore
    public Task SetSecurityStampAsync(AppUser user, string stamp, CancellationToken ct)
    {
        user.SecurityStamp = stamp;
        return Task.CompletedTask;
    }

    public Task<string?> GetSecurityStampAsync(AppUser user, CancellationToken ct) => Task.FromResult<string?>(user.SecurityStamp);
}
