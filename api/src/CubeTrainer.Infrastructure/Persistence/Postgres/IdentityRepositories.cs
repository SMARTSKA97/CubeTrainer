using CubeTrainer.Application.Abstractions;
using CubeTrainer.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace CubeTrainer.Infrastructure.Persistence.Postgres;

public sealed class PostgresUserRepository(CubeDbContext db) : IUserRepository
{
    public Task<AppUser?> FindByIdAsync(Guid id, CancellationToken ct) =>
        db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id, ct);

    public Task<AppUser?> FindByNormalizedEmailAsync(string normalizedEmail, CancellationToken ct) =>
        db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.NormalizedEmail == normalizedEmail, ct);

    public Task<AppUser?> FindByNormalizedHandleAsync(string normalizedHandle, CancellationToken ct) =>
        db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.NormalizedHandle == normalizedHandle, ct);

    public async Task<bool> TryCreateAsync(AppUser user, CancellationToken ct)
    {
        try
        {
            db.Users.Add(user);
            await db.SaveChangesAsync(ct);
            return true;
        }
        catch (DbUpdateException)
        {
            if (await ConflictsAsync(user, ct)) return false; // unique index on email or handle won the race
            throw;
        }
    }

    public async Task<bool> TryUpdateAsync(AppUser user, CancellationToken ct)
    {
        try
        {
            var tracked = db.Users.Local.FirstOrDefault(u => u.Id == user.Id);
            if (tracked is not null && !ReferenceEquals(tracked, user)) db.Entry(tracked).State = EntityState.Detached;
            db.Users.Update(user);
            await db.SaveChangesAsync(ct);
            return true;
        }
        catch (DbUpdateException)
        {
            if (await ConflictsAsync(user, ct)) return false;
            throw;
        }
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct) =>
        await db.Users.Where(u => u.Id == id).ExecuteDeleteAsync(ct);

    private async Task<bool> ConflictsAsync(AppUser user, CancellationToken ct)
    {
        db.ChangeTracker.Clear();
        return await db.Users.AsNoTracking().AnyAsync(u => u.Id != user.Id && (u.NormalizedEmail == user.NormalizedEmail || u.NormalizedHandle == user.NormalizedHandle), ct);
    }
}

public sealed class PostgresRefreshTokenRepository(CubeDbContext db) : IRefreshTokenRepository
{
    public async Task AddAsync(RefreshToken token, CancellationToken ct)
    {
        db.RefreshTokens.Add(token);
        await db.SaveChangesAsync(ct);
    }

    public Task<RefreshToken?> FindByHashAsync(string tokenHash, CancellationToken ct) =>
        db.RefreshTokens.AsNoTracking().FirstOrDefaultAsync(t => t.TokenHash == tokenHash, ct);

    public async Task<bool> TryMarkUsedAsync(Guid id, DateTimeOffset now, CancellationToken ct) =>
        await db.RefreshTokens.Where(t => t.Id == id && t.UsedAt == null).ExecuteUpdateAsync(s => s.SetProperty(t => t.UsedAt, now), ct) > 0;

    public async Task RevokeFamilyAsync(Guid familyId, DateTimeOffset now, CancellationToken ct) =>
        await db.RefreshTokens.Where(t => t.FamilyId == familyId && t.RevokedAt == null).ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), ct);

    public async Task RevokeAllForUserAsync(Guid userId, Guid? exceptFamilyId, DateTimeOffset now, CancellationToken ct) =>
        await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null && (exceptFamilyId == null || t.FamilyId != exceptFamilyId))
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), ct);

    public async Task<IReadOnlyList<RefreshToken>> ListActiveSessionsAsync(Guid userId, DateTimeOffset now, CancellationToken ct)
    {
        // A user has a handful of sessions, so group in memory instead of fighting the SQL translation.
        var rows = await db.RefreshTokens.AsNoTracking()
            .Where(t => t.UserId == userId && t.RevokedAt == null && t.FamilyExpiresAt > now)
            .ToListAsync(ct);
        return rows.GroupBy(t => t.FamilyId).Select(g => g.OrderByDescending(t => t.CreatedAt).First()).ToList();
    }

    public async Task DeleteExpiredAsync(DateTimeOffset olderThan, CancellationToken ct) =>
        await db.RefreshTokens.Where(t => t.ExpiresAt < olderThan).ExecuteDeleteAsync(ct);
}

public sealed class PostgresUserTokenRepository(CubeDbContext db) : IUserTokenRepository
{
    public async Task AddAsync(UserToken token, CancellationToken ct)
    {
        db.UserTokens.Add(token);
        await db.SaveChangesAsync(ct);
    }

    public Task<UserToken?> FindByHashAsync(string tokenHash, CancellationToken ct) =>
        db.UserTokens.AsNoTracking().FirstOrDefaultAsync(t => t.TokenHash == tokenHash, ct);

    public async Task<bool> TryMarkUsedAsync(Guid id, DateTimeOffset now, CancellationToken ct) =>
        await db.UserTokens.Where(t => t.Id == id && t.UsedAt == null).ExecuteUpdateAsync(s => s.SetProperty(t => t.UsedAt, now), ct) > 0;

    public async Task InvalidateAsync(Guid userId, string purpose, DateTimeOffset now, CancellationToken ct) =>
        await db.UserTokens.Where(t => t.UserId == userId && t.Purpose == purpose && t.UsedAt == null).ExecuteUpdateAsync(s => s.SetProperty(t => t.UsedAt, now), ct);
}
