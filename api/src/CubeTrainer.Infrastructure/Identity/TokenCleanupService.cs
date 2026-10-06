using CubeTrainer.Application.Abstractions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CubeTrainer.Infrastructure.Identity;

/// <summary>Deletes refresh tokens that expired more than a week ago.</summary>
public sealed partial class TokenCleanupService(IServiceScopeFactory scopes, TimeProvider clock, ILogger<TokenCleanupService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(6));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<IRefreshTokenRepository>().DeleteExpiredAsync(clock.GetUtcNow().AddDays(-7), stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                CleanupFailed(log, ex.Message);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Token cleanup failed: {Reason}")]
    private static partial void CleanupFailed(ILogger logger, string reason);
}
