namespace CubeTrainer.Domain.Users;

/// <summary>A CubeTrainer account. Independent of Life OS.</summary>
public sealed class AppUser
{
    public Guid Id { get; set; }

    public string Email { get; set; } = string.Empty;

    public string NormalizedEmail { get; set; } = string.Empty;

    public bool EmailConfirmed { get; set; }

    /// <summary>Null for accounts that only sign in through a social provider.</summary>
    public string? PasswordHash { get; set; }

    public string SecurityStamp { get; set; } = Guid.NewGuid().ToString("N");

    public bool LockoutEnabled { get; set; } = true;

    public DateTimeOffset? LockoutEnd { get; set; }

    public int AccessFailedCount { get; set; }

    public bool TwoFactorEnabled { get; set; }

    /// <summary>Authenticator-app secret, encrypted at rest. Present while 2FA is being set up and while it is on.</summary>
    public string? TotpSecret { get; set; }

    /// <summary>Time step of the last accepted code; a code from the same or an earlier step is a replay.</summary>
    public long? TotpLastStep { get; set; }

    public string Handle { get; set; } = string.Empty;

    public string NormalizedHandle { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    /// <summary>ISO 3166-1 alpha-2, upper case.</summary>
    public string Country { get; set; } = string.Empty;

    /// <summary>Self-declared, year only.</summary>
    public int BirthYear { get; set; }

    public string? CubeMethod { get; set; }

    public string? CubeModel { get; set; }

    public int? CubingSinceYear { get; set; }

    public bool LeaderboardOptIn { get; set; }

    public string TermsVersion { get; set; } = string.Empty;

    public DateTimeOffset TermsAcceptedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public AppUser Copy() => (AppUser)MemberwiseClone();
}

public static class CubeMethods
{
    public static readonly string[] All = ["cfop", "roux", "zz", "petrus", "beginner", "mehta", "other"];

    public static bool IsValid(string? v) => v is null || Array.IndexOf(All, v) >= 0;
}
