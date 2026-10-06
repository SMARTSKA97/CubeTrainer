using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace CubeTrainer.Infrastructure.Persistence.Postgres;

/// <summary>
/// Ready only when the database answers AND the Flyway migrations have run
/// (flyway_schema_history exists and has at least one successful row).
/// </summary>
public sealed class DatabaseHealthCheck(CubeDbContext db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            var migrated = await db.Database
                .SqlQueryRaw<int>("SELECT count(*)::int AS \"Value\" FROM flyway_schema_history WHERE success")
                .SingleAsync(cancellationToken);
            return migrated > 0
                ? HealthCheckResult.Healthy($"{migrated} migrations applied")
                : HealthCheckResult.Unhealthy("flyway_schema_history is empty: run the migrations");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("Database unreachable or not migrated", ex);
        }
    }
}
