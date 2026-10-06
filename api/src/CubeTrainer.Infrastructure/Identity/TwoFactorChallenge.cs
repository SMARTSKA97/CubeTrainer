using System.Text.Json;
using CubeTrainer.Application.Auth.TwoFactor;
using Microsoft.AspNetCore.DataProtection;

namespace CubeTrainer.Infrastructure.Identity;

/// <summary>A sealed "password step passed" note with an expiry. Stateless; failed codes are limited by the account lockout.</summary>
public sealed class TwoFactorChallenge(IDataProtectionProvider provider, TimeProvider clock) : ITwoFactorChallenge
{
    private readonly IDataProtector _protector = provider.CreateProtector("CubeTrainer.TwoFactorChallenge.v1");

    private sealed record Payload(Guid UserId, DateTimeOffset Expires);

    public string Issue(Guid userId, TimeSpan lifetime) =>
        _protector.Protect(JsonSerializer.Serialize(new Payload(userId, clock.GetUtcNow().Add(lifetime))));

    public Guid? Read(string challenge)
    {
        try
        {
            var payload = JsonSerializer.Deserialize<Payload>(_protector.Unprotect(challenge));
            return payload is not null && payload.Expires > clock.GetUtcNow() ? payload.UserId : null;
        }
        catch (Exception ex) when (ex is System.Security.Cryptography.CryptographicException or JsonException or FormatException)
        {
            return null;
        }
    }
}
