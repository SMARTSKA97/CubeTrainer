namespace CubeTrainer.Domain.Users;

/// <summary>One single-use backup code for signing in without the authenticator app. Only a hash is stored.</summary>
public sealed class RecoveryCode
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public string CodeHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UsedAt { get; set; }
}
