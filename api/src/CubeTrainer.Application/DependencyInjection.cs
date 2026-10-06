using CubeTrainer.Application.Auth;
using CubeTrainer.Application.Auth.Identity;
using CubeTrainer.Application.Cases;
using CubeTrainer.Application.Solves;
using CubeTrainer.Application.Stats;
using CubeTrainer.Application.Summary;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace CubeTrainer.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services, IConfiguration config)
    {
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<SolveService>();
        services.AddScoped<StatsService>();
        services.AddScoped<CaseStatusService>();
        services.AddScoped<SummaryService>();

        var auth = config.GetSection(AuthOptions.Section).Get<AuthOptions>() ?? new AuthOptions();
        services.Configure<AuthOptions>(config.GetSection(AuthOptions.Section));
        services.Configure<WebOptions>(config.GetSection(WebOptions.Section));
        services.AddCubeTrainerIdentity(auth);
        services.AddScoped<AuthService>();
        return services;
    }
}
