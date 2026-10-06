using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Auth;
using CubeTrainer.Domain.Users;
using Microsoft.Extensions.Logging;
using CubeTrainer.Application.Auth.External;
using CubeTrainer.Application.Auth.TwoFactor;
using CubeTrainer.Infrastructure.Email;
using CubeTrainer.Infrastructure.External;
using CubeTrainer.Infrastructure.Identity;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
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
        services.AddIdentityInfrastructure(config, env);

#if POSTGRES
        if (connectionString is not null)
        {
            // Retries cover Neon waking from suspend; the schema itself is owned by Flyway (see /db/migrations).
            services.AddDbContext<CubeDbContext>(o => o.UseNpgsql(connectionString, n => n.EnableRetryOnFailure(3)));
            services.AddScoped<ISolveRepository, PostgresSolveRepository>();
            services.AddScoped<ICaseStatusRepository, PostgresCaseStatusRepository>();
            services.AddScoped<IUserRepository, PostgresUserRepository>();
            services.AddScoped<IRefreshTokenRepository, PostgresRefreshTokenRepository>();
            services.AddScoped<IUserTokenRepository, PostgresUserTokenRepository>();
            services.AddScoped<IExternalLoginRepository, PostgresExternalLoginRepository>();
            services.AddScoped<IRecoveryCodeRepository, PostgresRecoveryCodeRepository>();
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
        services.AddSingleton<IUserRepository, InMemoryUserRepository>();
        services.AddSingleton<IRefreshTokenRepository, InMemoryRefreshTokenRepository>();
        services.AddSingleton<IUserTokenRepository, InMemoryUserTokenRepository>();
        services.AddSingleton<IExternalLoginRepository, InMemoryExternalLoginRepository>();
        services.AddSingleton<IRecoveryCodeRepository, InMemoryRecoveryCodeRepository>();
        return services;
    }

    private static IServiceCollection AddIdentityInfrastructure(this IServiceCollection services, IConfiguration config, IHostEnvironment env)
    {
        // ---- JWT signing key: mandatory outside Development so a default key can never reach production.
        services.AddOptions<JwtOptions>().Bind(config.GetSection(JwtOptions.Section)).PostConfigure(o =>
        {
            if (string.IsNullOrWhiteSpace(o.SigningKey) && env.IsDevelopment()) o.SigningKey = "development-only-signing-key-do-not-use-in-production-0123456789";
        }).Validate(
            o => o.SigningKey.Length >= JwtKeys.MinKeyLength,
            $"Jwt:SigningKey must be set to a random secret of at least {JwtKeys.MinKeyLength} characters (environment variable Jwt__SigningKey).").ValidateOnStart();
        services.AddSingleton<IAccessTokenIssuer, JwtAccessTokenIssuer>();

        // ---- Two-step verification: authenticator secrets are encrypted with a key from configuration (Totp__EncryptionKey).
        services.AddOptions<TotpOptions>().Bind(config.GetSection(TotpOptions.Section)).PostConfigure(o =>
        {
            if (string.IsNullOrWhiteSpace(o.EncryptionKey) && env.IsDevelopment()) o.EncryptionKey = Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData("cubetrainer-development-only-totp-key"u8));
        }).Validate(
            o => TotpOptions.IsValidKey(o.EncryptionKey),
            "Totp:EncryptionKey must be 32 random bytes, base64 encoded (generate with: openssl rand -base64 32; environment variable Totp__EncryptionKey).").ValidateOnStart();
        services.AddSingleton<ITotpSecretProtector, AesGcmTotpSecretProtector>();
        services.AddSingleton<ITwoFactorChallenge, TwoFactorChallenge>();

        // ---- Social login: providers switch on when ExternalAuth:Providers:<id>:ClientId/ClientSecret are set.
        services.Configure<ExternalAuthOptions>(config.GetSection(ExternalAuthOptions.Section));
        services.AddDataProtection().SetApplicationName("CubeTrainer");
        services.AddSingleton<IExternalTicketProtector, TicketProtector>();
        services.AddHttpClient("oauth", c => c.Timeout = TimeSpan.FromSeconds(15));
        services.AddSingleton<IOAuthGateway, OAuthGateway>();

        // ---- Email: queue + background sender; Brevo in production, log output in development.
        services.Configure<EmailOptions>(config.GetSection(EmailOptions.Section));
        var email = config.GetSection(EmailOptions.Section).Get<EmailOptions>() ?? new EmailOptions();
        if (string.Equals(email.Provider, "Brevo", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(email.BrevoApiKey)) throw new InvalidOperationException("Email:BrevoApiKey is required when Email:Provider=Brevo (environment variable Email__BrevoApiKey).");
            services.AddHttpClient<IEmailSender, BrevoEmailSender>(c =>
            {
                c.BaseAddress = new Uri(email.BrevoBaseUrl);
                c.Timeout = TimeSpan.FromSeconds(15);
            });
        }
        else
        {
            if (env.IsProduction()) throw new InvalidOperationException("Email:Provider=Log only prints emails. Set Email:Provider=Brevo for production.");
            services.AddSingleton<IEmailSender, LoggingEmailSender>();
        }

        services.AddSingleton<ChannelEmailQueue>();
        services.AddSingleton<IEmailQueue>(sp => sp.GetRequiredService<ChannelEmailQueue>());
        services.AddHostedService<EmailDispatcher>();
        services.AddOptions<RetentionOptions>().Bind(config.GetSection(RetentionOptions.Section)).Validate(o => o.TombstoneDays is >= 7 and <= 3650, "Retention:TombstoneDays must be between 7 and 3650.");
        services.AddHostedService<TokenCleanupService>();

        // ---- Breached-password check (Have I Been Pwned range API).
        services.AddHttpClient<BreachedPasswordValidator>(c =>
        {
            c.BaseAddress = new Uri("https://api.pwnedpasswords.com");
            c.Timeout = TimeSpan.FromSeconds(4);
            c.DefaultRequestHeaders.Add("Add-Padding", "true");
        });
        services.AddScoped<IPasswordValidator<AppUser>>(sp => sp.GetRequiredService<BreachedPasswordValidator>());
        return services;
    }
}
