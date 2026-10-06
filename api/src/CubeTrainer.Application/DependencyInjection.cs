using CubeTrainer.Application.Cases;
using CubeTrainer.Application.Solves;
using CubeTrainer.Application.Stats;
using CubeTrainer.Application.Summary;
using Microsoft.Extensions.DependencyInjection;

namespace CubeTrainer.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<SolveService>();
        services.AddScoped<StatsService>();
        services.AddScoped<CaseStatusService>();
        services.AddScoped<SummaryService>();
        return services;
    }
}
