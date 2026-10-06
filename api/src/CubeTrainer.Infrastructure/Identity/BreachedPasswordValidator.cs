using System.Security.Cryptography;
using System.Text;
using CubeTrainer.Application.Auth;
using CubeTrainer.Domain.Users;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CubeTrainer.Infrastructure.Identity;

/// <summary>
/// Rejects passwords found in known data breaches using Have I Been Pwned's k-anonymity API: only the first
/// 5 characters of the password's SHA-1 leave the server, never the password. Fails open if the service is down.
/// </summary>
public sealed partial class BreachedPasswordValidator(HttpClient http, IOptions<AuthOptions> options, ILogger<BreachedPasswordValidator> log) : IPasswordValidator<AppUser>
{
    public async Task<IdentityResult> ValidateAsync(UserManager<AppUser> manager, AppUser user, string? password)
    {
        if (!options.Value.CheckBreachedPasswords || string.IsNullOrEmpty(password)) return IdentityResult.Success;

        try
        {
            var hash = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(password)));
            var prefix = hash[..5];
            var suffix = hash[5..];
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            var body = await http.GetStringAsync($"/range/{prefix}", cts.Token);
            foreach (var line in body.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (line.StartsWith(suffix, StringComparison.OrdinalIgnoreCase) && !line.EndsWith(":0", StringComparison.Ordinal))
                {
                    return IdentityResult.Failed(new IdentityError
                    {
                        Code = "PasswordBreached",
                        Description = "This password appears in known data breaches. Choose a different one.",
                    });
                }
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or OperationCanceledException)
        {
            CheckUnavailable(log, ex.Message);
        }

        return IdentityResult.Success;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Breached-password check unavailable, allowing the password: {Reason}")]
    private static partial void CheckUnavailable(ILogger logger, string reason);
}
