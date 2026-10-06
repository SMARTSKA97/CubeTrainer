using CubeTrainer.Domain.Cases;
using CubeTrainer.Domain.Solves;
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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);

        modelBuilder.Entity<Solve>(e =>
        {
            e.ToTable("solves");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
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
            e.HasKey(x => x.CaseId);
            e.Property(x => x.CaseId).HasColumnName("case_id");
            e.Property(x => x.Status).HasColumnName("status");
        });
    }
}
