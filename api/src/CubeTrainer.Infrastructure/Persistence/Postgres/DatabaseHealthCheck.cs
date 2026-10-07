using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace CubeTrainer.Infrastructure.Persistence.Postgres;

/// <summary>
/// Ready only when the database answers AND the Flyway migrations have run
/// (flyway_schema_history exists and has at least one successful row).
/// </summary>
public sealed class DatabaseHealthCheck(CubeDbContext db) : IHealthCheck
{
    // A healthy answer is reused for a while so a frequent probe (a hosting platform polls every few
    // seconds) does not hit the database each time and keep a serverless database awake for ever.
    // An unhealthy answer is never cached, so recovery shows up on the very next probe.
    private static readonly TimeSpan HealthyFor = TimeSpan.FromMinutes(5);
    private static long _healthyUntilTicks;

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        if (Environment.TickCount64 < Interlocked.Read(ref _healthyUntilTicks))
            return HealthCheckResult.Healthy("migrations applied (cached)");
        try
        {
            var migrated = await db.Database
                .SqlQueryRaw<int>("SELECT count(*)::int AS \"Value\" FROM flyway_schema_history WHERE success")
                .SingleAsync(cancellationToken);
            if (migrated <= 0)
                return HealthCheckResult.Unhealthy("flyway_schema_history is empty: run the migrations");
            Interlocked.Exchange(ref _healthyUntilTicks, Environment.TickCount64 + (long)HealthyFor.TotalMilliseconds);
            return HealthCheckResult.Healthy($"{migrated} migrations applied");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("Database unreachable or not migrated", ex);
        }
    }
}
