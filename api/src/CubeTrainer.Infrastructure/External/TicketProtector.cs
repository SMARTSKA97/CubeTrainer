using System.Text.Json;
using CubeTrainer.Application.Auth.External;
using Microsoft.AspNetCore.DataProtection;

namespace CubeTrainer.Infrastructure.External;

/// <summary>
/// Encrypts and signs the provider profile with ASP.NET Data Protection and embeds an expiry. Nothing is stored server-side.
/// (Keys live in memory unless you configure a key ring, so a restart invalidates tickets in flight; people just start again.)
/// </summary>
public sealed class TicketProtector(IDataProtectionProvider provider, TimeProvider clock) : IExternalTicketProtector
{
    private readonly IDataProtector _protector = provider.CreateProtector("CubeTrainer.ExternalSignUpTicket.v1");

    private sealed record Payload(ExternalProfile Profile, DateTimeOffset Expires);

    public string Protect(ExternalProfile profile, TimeSpan lifetime) =>
        _protector.Protect(JsonSerializer.Serialize(new Payload(profile, clock.GetUtcNow().Add(lifetime))));

    public ExternalProfile? Unprotect(string ticket)
    {
        try
        {
            var payload = JsonSerializer.Deserialize<Payload>(_protector.Unprotect(ticket));
            return payload is not null && payload.Expires > clock.GetUtcNow() ? payload.Profile : null;
        }
        catch (Exception ex) when (ex is System.Security.Cryptography.CryptographicException or JsonException or FormatException)
        {
            return null;
        }
    }
}
