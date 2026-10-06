namespace CubeTrainer.Domain.Users;

/// <summary>A sign-in method from another provider (Google, GitHub ...) attached to an account.</summary>
public sealed class ExternalLogin
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    /// <summary>Lower-case provider id such as "google".</summary>
    public string Provider { get; set; } = string.Empty;

    /// <summary>The provider's stable id for the person (never their email, which can change).</summary>
    public string Subject { get; set; } = string.Empty;

    /// <summary>Email the provider reported when linking; informational only.</summary>
    public string? Email { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
