namespace CubeTrainer.Application.Auth.External;

/// <summary>What a provider told us about the person after they approved the sign-in.</summary>
public sealed record ExternalProfile(string Provider, string Subject, string? Email, bool EmailVerified, string? Name);

public sealed record OAuthStart(string AuthorizeUrl, string State, string CodeVerifier);

public sealed record ProviderInfo(string Id, string Name);

/// <summary>Talks to the identity providers (implemented in Infrastructure; faked in tests).</summary>
public interface IOAuthGateway
{
    IReadOnlyList<ProviderInfo> EnabledProviders { get; }

    bool IsEnabled(string provider);

    OAuthStart BuildStart(string provider, string redirectUri);

    /// <summary>Exchanges the authorization code and reads the person's identity; null when the provider refused.</summary>
    Task<ExternalProfile?> ExchangeAsync(string provider, string code, string redirectUri, string codeVerifier, CancellationToken ct);
}

/// <summary>Seals a provider profile into a short-lived opaque ticket that carries the user to the "finish sign-up" page.</summary>
public interface IExternalTicketProtector
{
    string Protect(ExternalProfile profile, TimeSpan lifetime);

    ExternalProfile? Unprotect(string ticket);
}

public abstract record ExternalOutcome;

public sealed record ExternalSignedIn(AuthSession Session) : ExternalOutcome;

public sealed record ExternalLinked(string Provider) : ExternalOutcome;

public sealed record ExternalNeedsProfile(ExternalProfile Profile) : ExternalOutcome;

/// <summary>Result of the "finish sign-up" step: a session when the email is already verified, otherwise "check your inbox".</summary>
public sealed record ExternalCompleted(AuthSession? Session);

public sealed record CompleteExternalRequest(
    string? Ticket,
    string? Email,
    string? DisplayName,
    string? Handle,
    string? Country,
    int? BirthYear,
    string? CubeMethod,
    string? CubeModel,
    int? CubingYears,
    bool AcceptTerms);

public sealed record LinkedIdentity(string Provider, string? Email, DateTimeOffset LinkedAt);

public sealed record IdentitiesView(bool HasPassword, IReadOnlyList<LinkedIdentity> Linked);
