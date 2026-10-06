using CubeTrainer.Domain.Cases;
using CubeTrainer.Domain.Solves;
using CubeTrainer.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace CubeTrainer.Infrastructure.Persistence.Postgres;

/// <summary>
/// Maps the domain onto the tables created by the Flyway migrations in /db/migrations.
/// EF Core never creates or alters the schema: there is deliberately no EnsureCreated and no EF migration.
/// </summary>
public sealed class CubeDbContext(DbContextOptions<CubeDbContext> options) : DbContext(options)
{
    public DbSet<Solve> Solves => Set<Solve>();

    public DbSet<CaseStatusEntry> CaseStatuses => Set<CaseStatusEntry>();

    public DbSet<AppUser> Users => Set<AppUser>();

    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    public DbSet<UserToken> UserTokens => Set<UserToken>();

    public DbSet<ExternalLogin> ExternalLogins => Set<ExternalLogin>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);

        modelBuilder.Entity<Solve>(e =>
        {
            e.ToTable("solves");
            e.HasKey(x => new { x.UserId, x.Id });
            e.Property(x => x.UserId).HasColumnName("user_id").ValueGeneratedNever();
            e.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
            // Assigned by a database trigger on every write (see V3 migration); the app never sends it.
            e.Property(x => x.Rev).HasColumnName("rev").ValueGeneratedOnAddOrUpdate();
            e.Property(x => x.DeletedAt).HasColumnName("deleted_at");
            e.Property(x => x.AtMs).HasColumnName("at_ms");
            e.Property(x => x.TimeMs).HasColumnName("time_ms");
            e.Property(x => x.Penalty).HasColumnName("penalty");
            e.Property(x => x.Scramble).HasColumnName("scramble");
            e.Property(x => x.Mode).HasColumnName("mode");
            e.Property(x => x.SetId).HasColumnName("set_id");
            e.Property(x => x.CaseId).HasColumnName("case_id");
            e.Property(x => x.Auf).HasColumnName("auf");
            e.Property(x => x.InspectionMs).HasColumnName("inspection_ms");
            e.Property(x => x.Stage).HasColumnName("stage");
            e.Property(x => x.Tags).HasColumnName("tags");
            e.Ignore(x => x.EffectiveMs);
        });

        modelBuilder.Entity<CaseStatusEntry>(e =>
        {
            e.ToTable("case_status");
            e.HasKey(x => new { x.UserId, x.CaseId });
            e.Property(x => x.UserId).HasColumnName("user_id").ValueGeneratedNever();
            e.Property(x => x.CaseId).HasColumnName("case_id").ValueGeneratedNever();
            e.Property(x => x.Rev).HasColumnName("rev").ValueGeneratedOnAddOrUpdate();
            e.Property(x => x.Status).HasColumnName("status");
        });

        modelBuilder.Entity<AppUser>(e =>
        {
            e.ToTable("users");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
            e.Property(x => x.Email).HasColumnName("email");
            e.Property(x => x.NormalizedEmail).HasColumnName("normalized_email");
            e.Property(x => x.EmailConfirmed).HasColumnName("email_confirmed");
            e.Property(x => x.PasswordHash).HasColumnName("password_hash");
            e.Property(x => x.SecurityStamp).HasColumnName("security_stamp");
            e.Property(x => x.LockoutEnabled).HasColumnName("lockout_enabled");
            e.Property(x => x.LockoutEnd).HasColumnName("lockout_end");
            e.Property(x => x.AccessFailedCount).HasColumnName("access_failed_count");
            e.Property(x => x.TwoFactorEnabled).HasColumnName("two_factor_enabled");
            e.Property(x => x.Handle).HasColumnName("handle");
            e.Property(x => x.NormalizedHandle).HasColumnName("normalized_handle");
            e.Property(x => x.DisplayName).HasColumnName("display_name");
            e.Property(x => x.Country).HasColumnName("country");
            e.Property(x => x.BirthYear).HasColumnName("birth_year");
            e.Property(x => x.CubeMethod).HasColumnName("cube_method");
            e.Property(x => x.CubeModel).HasColumnName("cube_model");
            e.Property(x => x.CubingSinceYear).HasColumnName("cubing_since_year");
            e.Property(x => x.LeaderboardOptIn).HasColumnName("leaderboard_opt_in");
            e.Property(x => x.TermsVersion).HasColumnName("terms_version");
            e.Property(x => x.TermsAcceptedAt).HasColumnName("terms_accepted_at");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<RefreshToken>(e =>
        {
            e.ToTable("refresh_tokens");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.FamilyId).HasColumnName("family_id");
            e.Property(x => x.TokenHash).HasColumnName("token_hash");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.ExpiresAt).HasColumnName("expires_at");
            e.Property(x => x.FamilyExpiresAt).HasColumnName("family_expires_at");
            e.Property(x => x.UsedAt).HasColumnName("used_at");
            e.Property(x => x.RevokedAt).HasColumnName("revoked_at");
            e.Property(x => x.UserAgent).HasColumnName("user_agent");
            e.Property(x => x.Ip).HasColumnName("ip");
        });

        modelBuilder.Entity<ExternalLogin>(e =>
        {
            e.ToTable("external_logins");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.Provider).HasColumnName("provider");
            e.Property(x => x.Subject).HasColumnName("subject");
            e.Property(x => x.Email).HasColumnName("email");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<UserToken>(e =>
        {
            e.ToTable("user_tokens");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.Purpose).HasColumnName("purpose");
            e.Property(x => x.TokenHash).HasColumnName("token_hash");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.ExpiresAt).HasColumnName("expires_at");
            e.Property(x => x.UsedAt).HasColumnName("used_at");
        });
    }
}
