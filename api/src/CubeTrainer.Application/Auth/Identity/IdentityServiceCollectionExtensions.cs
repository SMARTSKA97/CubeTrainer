using CubeTrainer.Domain.Users;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace CubeTrainer.Application.Auth.Identity;

public static class IdentityServiceCollectionExtensions
{
    /// <summary>UserManager with our store, a length-based password policy (NIST 800-63B) and lockout.</summary>
    public static IdentityBuilder AddCubeTrainerIdentity(this IServiceCollection services, AuthOptions auth)
    {
        services.Configure<PasswordHasherOptions>(o => o.IterationCount = 210_000);
        return services
            .AddIdentityCore<AppUser>(o =>
            {
                o.User.RequireUniqueEmail = true;
                o.Password.RequiredLength = auth.MinPasswordLength;
                o.Password.RequireDigit = false;
                o.Password.RequireLowercase = false;
                o.Password.RequireUppercase = false;
                o.Password.RequireNonAlphanumeric = false;
                o.Lockout.AllowedForNewUsers = true;
                o.Lockout.MaxFailedAccessAttempts = auth.MaxFailedAttempts;
                o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(auth.LockoutMinutes);
            })
            .AddUserStore<AppUserStore>()
            .AddPasswordValidator<PersonalDataPasswordValidator>();
    }
}

/// <summary>Rejects passwords that are too long to hash sanely or that contain the user's own email name or handle.</summary>
public sealed class PersonalDataPasswordValidator : IPasswordValidator<AppUser>
{
    public const int MaxLength = 128;

    public Task<IdentityResult> ValidateAsync(UserManager<AppUser> manager, AppUser user, string? password)
    {
        if (password is null) return Task.FromResult(IdentityResult.Success);
        if (password.Length > MaxLength)
        {
            return Fail($"Password must be at most {MaxLength} characters.");
        }

        var local = user.Email.Split('@')[0];
        if (local.Length >= 4 && password.Contains(local, StringComparison.OrdinalIgnoreCase)) return Fail("Password must not contain your email name.");
        if (user.Handle.Length >= 4 && password.Contains(user.Handle, StringComparison.OrdinalIgnoreCase)) return Fail("Password must not contain your username.");
        return Task.FromResult(IdentityResult.Success);

        static Task<IdentityResult> Fail(string message) =>
            Task.FromResult(IdentityResult.Failed(new IdentityError { Code = "PasswordPolicy", Description = message }));
    }
}
