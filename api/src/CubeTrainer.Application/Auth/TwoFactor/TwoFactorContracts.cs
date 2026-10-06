namespace CubeTrainer.Application.Auth.TwoFactor;

/// <summary>Encrypts the authenticator secret for storage (AES-GCM in production).</summary>
public interface ITotpSecretProtector
{
    string Protect(byte[] secret);

    byte[]? Unprotect(string stored);
}

/// <summary>A short-lived, tamper-proof note that "this person just passed the password step" (Data Protection in production).</summary>
public interface ITwoFactorChallenge
{
    string Issue(Guid userId, TimeSpan lifetime);

    Guid? Read(string challenge);
}

/// <summary>Outcome of the password step: a finished session, or a challenge the client must answer with a code.</summary>
public sealed record LoginOutcome(AuthSession? Session, string? Challenge);

public sealed record TwoFactorStatus(bool Enabled, int RecoveryCodesLeft);

public sealed record TwoFactorSetup(string Secret, string OtpAuthUri);

public sealed record RecoveryCodeSet(IReadOnlyList<string> Codes);
