using CubeTrainer.Application.Leaderboards;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CubeTrainer.Infrastructure.Identity;

/// <summary>Rebuilds every opted-in person's leaderboard results every <c>Leaderboards:RefreshMinutes</c> (default 10; 0 turns the job off).</summary>
public sealed partial class LeaderboardRefreshService(IServiceScopeFactory scopes, IConfiguration config, ILogger<LeaderboardRefreshService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var minutes = config.GetValue("Leaderboards:RefreshMinutes", 10);
        if (minutes <= 0) return;
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(minutes));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var n = await scope.ServiceProvider.GetRequiredService<LeaderboardService>().RefreshAllAsync(stoppingToken);
                if (n > 0) Refreshed(log, n);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                Failed(log, ex.Message);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    [LoggerMessage(Level = LogLevel.Debug, Message = "Refreshed leaderboards for {Count} people")]
    private static partial void Refreshed(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Leaderboard refresh failed: {Reason}")]
    private static partial void Failed(ILogger logger, string reason);
}
