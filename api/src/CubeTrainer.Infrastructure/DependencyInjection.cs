using CubeTrainer.Application.Abstractions;
using CubeTrainer.Infrastructure.Persistence;
using CubeTrainer.Infrastructure.Persistence.InMemory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
#if POSTGRES
using CubeTrainer.Infrastructure.Persistence.Postgres;
using Microsoft.EntityFrameworkCore;
#endif

namespace CubeTrainer.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config, IHostEnvironment env)
    {
        var connectionString = ConnectionStrings.Resolve(config);

#if POSTGRES
        if (connectionString is not null)
        {
            // Retries cover Neon waking from suspend; the schema itself is owned by Flyway (see /db/migrations).
            services.AddDbContext<CubeDbContext>(o => o.UseNpgsql(connectionString, n => n.EnableRetryOnFailure(3)));
            services.AddScoped<ISolveRepository, PostgresSolveRepository>();
            services.AddScoped<ICaseStatusRepository, PostgresCaseStatusRepository>();
            services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database", tags: ["ready"]);
            return services;
        }
#endif

        if (env.IsProduction() && !config.GetValue("Persistence:AllowInMemory", false))
        {
            throw new InvalidOperationException(
                "No database configured. Set DATABASE_URL (or ConnectionStrings:Postgres). " +
                "Set Persistence:AllowInMemory=true only for throw-away demos.");
        }

        services.AddSingleton<ISolveRepository, InMemorySolveRepository>();
        services.AddSingleton<ICaseStatusRepository, InMemoryCaseStatusRepository>();
        return services;
    }
}
