namespace CubeTrainer.Domain.Users;

public static class UserTokenPurposes
{
    public const string VerifyEmail = "verify_email";
    public const string ResetPassword = "reset_password";
}

/// <summary>A single-use token delivered by email (verify address, reset password).</summary>
public sealed class UserToken
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public string Purpose { get; set; } = string.Empty;

    public string TokenHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? UsedAt { get; set; }

    public UserToken Copy() => (UserToken)MemberwiseClone();
}
