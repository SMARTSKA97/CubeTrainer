using CubeTrainer.Application.Abstractions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CubeTrainer.Infrastructure.Identity;

/// <summary>Bound from "Retention". A device offline for longer than this could bring back a solve that was deleted elsewhere.</summary>
public sealed class RetentionOptions
{
    public const string Section = "Retention";

    public int TombstoneDays { get; set; } = 90;
}

/// <summary>Housekeeping: removes refresh tokens that expired a week ago and solve tombstones past the retention window.</summary>
public sealed partial class TokenCleanupService(IServiceScopeFactory scopes, TimeProvider clock, IOptions<RetentionOptions> retention, ILogger<TokenCleanupService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(6));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var now = clock.GetUtcNow();
                await scope.ServiceProvider.GetRequiredService<IRefreshTokenRepository>().DeleteExpiredAsync(now.AddDays(-7), stoppingToken);
                // Deleted solves are kept as tombstones so other devices learn about the delete; after the retention window they go for good.
                var purged = await scope.ServiceProvider.GetRequiredService<ISolveRepository>().PurgeTombstonesAsync(now.AddDays(-retention.Value.TombstoneDays), stoppingToken);
                if (purged > 0) Purged(log, purged);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                CleanupFailed(log, ex.Message);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Purged {Count} deleted-solve tombstones")]
    private static partial void Purged(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Token cleanup failed: {Reason}")]
    private static partial void CleanupFailed(ILogger logger, string reason);
}
