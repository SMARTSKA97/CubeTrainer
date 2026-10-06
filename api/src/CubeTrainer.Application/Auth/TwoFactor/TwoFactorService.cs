using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Common;
using CubeTrainer.Domain.Users;
using Microsoft.AspNetCore.Identity;

namespace CubeTrainer.Application.Auth.TwoFactor;

/// <summary>
/// Authenticator-app two-step verification. Rules worth knowing:
/// - turning it on needs the account password (when there is one) and a correct first code, so a half-finished setup never locks anyone out;
/// - a code works once (replay protection by time step) and wrong codes count towards the same lockout as wrong passwords;
/// - ten single-use recovery codes are shown once; using one is the way back in when the phone is lost;
/// - turning it off or making new recovery codes needs a valid code again, so a stolen session alone cannot weaken the account.
/// </summary>
public sealed class TwoFactorService(
    UserManager<AppUser> users,
    IUserRepository userRepo,
    IRecoveryCodeRepository recovery,
    ITotpSecretProtector protector,
    ITwoFactorChallenge challenges,
    AuthService auth,
    IEmailQueue mailQueue,
    TimeProvider clock)
{
    public const string Issuer = "CubeTrainer";

    public async Task<Result<TwoFactorStatus>> StatusAsync(Guid userId, CancellationToken ct)
    {
        var user = await userRepo.FindByIdAsync(userId, ct);
        if (user is null) return Result<TwoFactorStatus>.Fail(ErrorKind.NotFound, "user_not_found", "Account not found.");
        return Result<TwoFactorStatus>.Ok(new TwoFactorStatus(user.TwoFactorEnabled, user.TwoFactorEnabled ? await recovery.CountUnusedAsync(userId, ct) : 0));
    }

    /// <summary>Creates a fresh secret (not active yet) and returns it for the QR code. Repeating this replaces an unfinished setup.</summary>
    public async Task<Result<TwoFactorSetup>> BeginSetupAsync(Guid userId, string? password, CancellationToken ct)
    {
        var user = await userRepo.FindByIdAsync(userId, ct);
        if (user is null) return Result<TwoFactorSetup>.Fail(ErrorKind.NotFound, "user_not_found", "Account not found.");
        if (user.TwoFactorEnabled) return Result<TwoFactorSetup>.Fail(ErrorKind.Conflict, "two_factor_already_enabled", "Two-step verification is already on.");
        if (!await PasswordOkAsync(user, password)) return Result<TwoFactorSetup>.Fail(ErrorKind.Validation, "wrong_password", "Your password is incorrect.");

        var secret = Totp.NewSecret();
        user.TotpSecret = protector.Protect(secret);
        user.TotpLastStep = null;
        await users.UpdateAsync(user);
        var base32 = Totp.ToBase32(secret);
        return Result<TwoFactorSetup>.Ok(new TwoFactorSetup(base32, Totp.OtpAuthUri(Issuer, user.Email, base32)));
    }

    /// <summary>Checks the first code from the app; only then does two-step verification switch on. Returns the recovery codes (once).</summary>
    public async Task<Result<RecoveryCodeSet>> EnableAsync(Guid userId, string? code, CancellationToken ct)
    {
        var user = await userRepo.FindByIdAsync(userId, ct);
        if (user is null) return Result<RecoveryCodeSet>.Fail(ErrorKind.NotFound, "user_not_found", "Account not found.");
        if (user.TwoFactorEnabled) return Result<RecoveryCodeSet>.Fail(ErrorKind.Conflict, "two_factor_already_enabled", "Two-step verification is already on.");
        if (user.TotpSecret is null) return Result<RecoveryCodeSet>.Fail(ErrorKind.Validation, "setup_not_started", "Start the setup first.");

        var step = MatchTotp(user, code);
        if (step is null) return Result<RecoveryCodeSet>.Fail(ErrorKind.Validation, "invalid_code", "That code is not right. Check the app and try again.");

        user.TwoFactorEnabled = true;
        user.TotpLastStep = step;
        await users.UpdateAsync(user);
        var codes = await NewRecoveryCodesAsync(user.Id, ct);
        await mailQueue.EnqueueAsync(AuthEmails.TwoFactorChanged(user.Email, user.DisplayName, true), ct);
        return Result<RecoveryCodeSet>.Ok(new RecoveryCodeSet(codes));
    }

    public async Task<Result<Unit>> DisableAsync(Guid userId, string? password, string? code, CancellationToken ct)
    {
        var user = await userRepo.FindByIdAsync(userId, ct);
        if (user is null) return Result<Unit>.Fail(ErrorKind.NotFound, "user_not_found", "Account not found.");
        if (!user.TwoFactorEnabled) return Result<Unit>.Fail(ErrorKind.Conflict, "two_factor_not_enabled", "Two-step verification is not on.");
        if (!await PasswordOkAsync(user, password)) return Result<Unit>.Fail(ErrorKind.Validation, "wrong_password", "Your password is incorrect.");
        if (!await VerifySecondFactorAsync(user, code, ct)) return Result<Unit>.Fail(ErrorKind.Validation, "invalid_code", "That code is not right.");

        user.TwoFactorEnabled = false;
        user.TotpSecret = null;
        user.TotpLastStep = null;
        await users.UpdateAsync(user);
        await recovery.DeleteAllAsync(user.Id, ct);
        await mailQueue.EnqueueAsync(AuthEmails.TwoFactorChanged(user.Email, user.DisplayName, false), ct);
        return Result<Unit>.Ok(Unit.Value);
    }

    public async Task<Result<RecoveryCodeSet>> RegenerateRecoveryCodesAsync(Guid userId, string? code, CancellationToken ct)
    {
        var user = await userRepo.FindByIdAsync(userId, ct);
        if (user is null) return Result<RecoveryCodeSet>.Fail(ErrorKind.NotFound, "user_not_found", "Account not found.");
        if (!user.TwoFactorEnabled) return Result<RecoveryCodeSet>.Fail(ErrorKind.Conflict, "two_factor_not_enabled", "Two-step verification is not on.");
        if (!await VerifySecondFactorAsync(user, code, ct)) return Result<RecoveryCodeSet>.Fail(ErrorKind.Validation, "invalid_code", "That code is not right.");
        return Result<RecoveryCodeSet>.Ok(new RecoveryCodeSet(await NewRecoveryCodesAsync(user.Id, ct)));
    }

    /// <summary>Second step of sign-in: the challenge from the password step plus a code (or a recovery code).</summary>
    public async Task<Result<AuthSession>> CompleteSignInAsync(string? challenge, string? code, ClientInfo client, CancellationToken ct)
    {
        var expired = Result<AuthSession>.Fail(ErrorKind.Unauthorized, "challenge_expired", "That took too long. Enter your password again.");
        var userId = string.IsNullOrEmpty(challenge) ? null : challenges.Read(challenge);
        if (userId is null) return expired;
        var user = await userRepo.FindByIdAsync(userId.Value, ct);
        if (user is null || !user.TwoFactorEnabled) return expired;

        if (await users.IsLockedOutAsync(user))
        {
            return Result<AuthSession>.Fail(ErrorKind.TooManyRequests, "locked_out", "Too many failed attempts. Try again in a few minutes or reset your password.");
        }

        if (!await VerifySecondFactorAsync(user, code, ct))
        {
            await users.AccessFailedAsync(user);
            return Result<AuthSession>.Fail(ErrorKind.Unauthorized, "invalid_code", "That code is not right.");
        }

        await users.ResetAccessFailedCountAsync(user);
        return Result<AuthSession>.Ok(await auth.StartSignInAsync(user, client, ct));
    }

    // ------------------------------------------------------------------ helpers

    private async Task<bool> PasswordOkAsync(AppUser user, string? password) =>
        user.PasswordHash is null || (!string.IsNullOrEmpty(password) && await users.CheckPasswordAsync(user, password));

    /// <summary>A six-digit app code, or (if it does not look like one) a single-use recovery code.</summary>
    private async Task<bool> VerifySecondFactorAsync(AppUser user, string? code, CancellationToken ct)
    {
        if (Totp.Normalise(code) is not null)
        {
            var step = MatchTotp(user, code);
            if (step is null) return false;
            user.TotpLastStep = step; // burn the code: it cannot be replayed
            await users.UpdateAsync(user);
            return true;
        }

        var recoveryCode = RecoveryCodes.Normalise(code);
        return recoveryCode is not null && await recovery.TryUseAsync(user.Id, RecoveryCodes.Hash(recoveryCode), clock.GetUtcNow(), ct);
    }

    private long? MatchTotp(AppUser user, string? code)
    {
        var secret = user.TotpSecret is null ? null : protector.Unprotect(user.TotpSecret);
        return secret is null ? null : Totp.Match(secret, code, clock.GetUtcNow(), user.TotpLastStep);
    }

    private async Task<IReadOnlyList<string>> NewRecoveryCodesAsync(Guid userId, CancellationToken ct)
    {
        var codes = RecoveryCodes.Generate();
        await recovery.ReplaceAllAsync(userId, codes.Select(c => RecoveryCodes.Hash(RecoveryCodes.Normalise(c)!)).ToList(), clock.GetUtcNow(), ct);
        return codes;
    }
}
