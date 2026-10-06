namespace CubeTrainer.Domain.Users;

/// <summary>One link of a rotating refresh-token chain. <see cref="FamilyId"/> identifies one signed-in device.</summary>
public sealed class RefreshToken
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public Guid FamilyId { get; set; }

    /// <summary>SHA-256 hex of the token. The token itself is never stored.</summary>
    public string TokenHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>Absolute cap for the whole family, so a session cannot be extended forever.</summary>
    public DateTimeOffset FamilyExpiresAt { get; set; }

    public DateTimeOffset? UsedAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }

    public string? UserAgent { get; set; }

    public string? Ip { get; set; }

    public RefreshToken Copy() => (RefreshToken)MemberwiseClone();
}
