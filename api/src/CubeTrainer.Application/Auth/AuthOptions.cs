namespace CubeTrainer.Application.Auth;

/// <summary>Bound from the "Auth" configuration section.</summary>
public sealed class AuthOptions
{
    public const string Section = "Auth";

    /// <summary>Self-declared minimum age to create an account (13 follows COPPA/GDPR-K; India's DPDP Act asks for parental consent below 18).</summary>
    public int MinimumAge { get; set; } = 13;

    public int MinPasswordLength { get; set; } = 10;

    public bool RequireConfirmedEmail { get; set; } = true;

    public int AccessTokenMinutes { get; set; } = 15;

    public int RefreshTokenDays { get; set; } = 30;

    /// <summary>Absolute lifetime of one sign-in, however often it is refreshed.</summary>
    public int SessionMaxDays { get; set; } = 90;

    public int VerifyEmailHours { get; set; } = 24;

    public int ResetPasswordMinutes { get; set; } = 60;

    public int MaxFailedAttempts { get; set; } = 5;

    public int LockoutMinutes { get; set; } = 15;

    /// <summary>A refresh token presented again within this many seconds of its first use is a benign race (two tabs), not theft.</summary>
    public int RefreshReuseGraceSeconds { get; set; } = 10;

    /// <summary>Version of the terms and privacy text the user accepted at registration.</summary>
    public string TermsVersion { get; set; } = "2026-10";

    public bool CheckBreachedPasswords { get; set; } = true;
}

public sealed class JwtOptions
{
    public const string Section = "Jwt";

    public string Issuer { get; set; } = "cubetrainer";

    public string Audience { get; set; } = "cubetrainer-clients";

    /// <summary>HMAC key, at least 32 characters. Set it with the Jwt__SigningKey environment variable.</summary>
    public string SigningKey { get; set; } = string.Empty;
}

public sealed class WebOptions
{
    public const string Section = "Web";

    /// <summary>Where the web app lives; email links point here.</summary>
    public string BaseUrl { get; set; } = "http://localhost:4200";
}
