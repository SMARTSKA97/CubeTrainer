namespace CubeTrainer.Infrastructure.External;

/// <summary>Bound from "ExternalAuth". A provider is switched on by giving it a ClientId and ClientSecret; nothing else is needed.</summary>
public sealed class ExternalAuthOptions
{
    public const string Section = "ExternalAuth";

    /// <summary>Public base URL of the API, e.g. https://api.example.com. Empty = derive from the request.</summary>
    public string CallbackBaseUrl { get; set; } = string.Empty;

    public Dictionary<string, ProviderSettings> Providers { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class ProviderSettings
{
    public string ClientId { get; set; } = string.Empty;

    public string ClientSecret { get; set; } = string.Empty;

    // Optional overrides (the defaults are each provider's public endpoints). Used by tests to point at a fake provider.
    public string? AuthorizeUrl { get; set; }

    public string? TokenUrl { get; set; }

    public string? UserInfoUrl { get; set; }

    public string? EmailsUrl { get; set; }
}
