using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Common;
using CubeTrainer.Domain.Users;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace CubeTrainer.Application.Auth;

/// <summary>
/// Account use cases. Rules worth knowing:
/// - sign-up and "forgot password" answer the same whether or not the email is registered (no account enumeration);
/// - refresh tokens rotate on every use and reuse of a spent token revokes the whole sign-in (theft detection);
/// - every password change or reset signs the other devices out.
/// </summary>
public sealed class AuthService(
    UserManager<AppUser> users,
    IUserRepository userRepo,
    IRefreshTokenRepository refreshTokens,
    IUserTokenRepository userTokens,
    IAccessTokenIssuer accessTokens,
    IEmailQueue mailQueue,
    IOptions<AuthOptions> authOptions,
    IOptions<WebOptions> webOptions,
    TimeProvider clock)
{
    private readonly AuthOptions _auth = authOptions.Value;
    private readonly WebOptions _web = webOptions.Value;

    // ------------------------------------------------------------------ sign up

    public async Task<Result<Unit>> RegisterAsync(RegisterRequest req, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var email = req.Email?.Trim();
        var handle = req.Handle?.Trim();
        var name = req.DisplayName?.Trim();
        var country = req.Country?.Trim().ToUpperInvariant();
        var model = string.IsNullOrWhiteSpace(req.CubeModel) ? null : req.CubeModel.Trim();
        var method = string.IsNullOrWhiteSpace(req.CubeMethod) ? null : req.CubeMethod.Trim().ToLowerInvariant();

        var problems = new List<string?>
        {
            ProfileValidator.Email(email),
            ProfileValidator.Handle(handle),
            ProfileValidator.DisplayName(name),
            ProfileValidator.Country(country),
            ProfileValidator.BirthYear(req.BirthYear, _auth.MinimumAge, now.Year),
            ProfileValidator.CubeMethod(method),
            ProfileValidator.CubeModel(model),
            ProfileValidator.CubingYears(req.CubingYears),
            string.IsNullOrEmpty(req.Password) ? "Choose a password." : null,
            req.AcceptTerms ? null : "You need to accept the terms and privacy policy.",
        }.Where(p => p is not null).Select(p => p!).ToList();
        if (problems.Count > 0) return Result<Unit>.Fail(ErrorKind.Validation, "invalid_registration", problems[0], problems);

        var normalizedEmail = users.NormalizeEmail(email!);
        var existing = await userRepo.FindByNormalizedEmailAsync(normalizedEmail, ct);
        if (existing is not null)
        {
            // Same answer as a fresh sign-up; the real owner gets a heads-up instead. The hash keeps the timing alike.
            _ = users.PasswordHasher.HashPassword(existing, req.Password!);
            var resetToken = await NewEmailTokenAsync(existing, UserTokenPurposes.ResetPassword, TimeSpan.FromMinutes(_auth.ResetPasswordMinutes), ct);
            await mailQueue.EnqueueAsync(AuthEmails.AlreadyRegistered(existing.Email, existing.DisplayName, Link("reset-password", resetToken)), ct);
            return Result<Unit>.Ok(Unit.Value);
        }

        if (await userRepo.FindByNormalizedHandleAsync(users.NormalizeName(handle!), ct) is not null)
        {
            return Result<Unit>.Fail(ErrorKind.Conflict, "handle_taken", "That username is taken.");
        }

        var user = new AppUser
        {
            Id = Guid.CreateVersion7(),
            Email = email!,
            Handle = handle!,
            DisplayName = name!,
            Country = country!,
            BirthYear = req.BirthYear!.Value,
            CubeMethod = method,
            CubeModel = model,
            CubingSinceYear = req.CubingYears is { } years ? now.Year - years : null,
            TermsVersion = _auth.TermsVersion,
            TermsAcceptedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };
        var created = await users.CreateAsync(user, req.Password!);
        if (!created.Succeeded)
        {
            if (created.Errors.Any(e => e.Code is "DuplicateUserName" or "DuplicateEmail" or "DuplicateUser"))
            {
                // Lost a race for the same email/handle; stay quiet about email, tell about handle only if it is the handle.
                return await userRepo.FindByNormalizedEmailAsync(normalizedEmail, ct) is not null
                    ? Result<Unit>.Ok(Unit.Value)
                    : Result<Unit>.Fail(ErrorKind.Conflict, "handle_taken", "That username is taken.");
            }

            return PasswordProblem(created);
        }

        var token = await NewEmailTokenAsync(user, UserTokenPurposes.VerifyEmail, TimeSpan.FromHours(_auth.VerifyEmailHours), ct);
        await mailQueue.EnqueueAsync(AuthEmails.VerifyEmail(user.Email, user.DisplayName, Link("verify-email", token), _auth.VerifyEmailHours), ct);
        return Result<Unit>.Ok(Unit.Value);
    }

    public async Task<Result<bool>> HandleAvailableAsync(string? handle, CancellationToken ct)
    {
        var problem = ProfileValidator.Handle(handle);
        if (problem is not null) return Result<bool>.Fail(ErrorKind.Validation, "invalid_handle", problem);
        return Result<bool>.Ok(await userRepo.FindByNormalizedHandleAsync(users.NormalizeName(handle!), ct) is null);
    }

    // ------------------------------------------------------------ email address

    public async Task<Result<Unit>> VerifyEmailAsync(string? token, CancellationToken ct)
    {
        var (user, userToken) = await ConsumeTokenAsync(token, UserTokenPurposes.VerifyEmail, ct);
        if (user is null || userToken is null) return InvalidLink();
        if (!user.EmailConfirmed)
        {
            user.EmailConfirmed = true;
            await users.UpdateAsync(user);
        }

        return Result<Unit>.Ok(Unit.Value);
    }

    public async Task<Result<Unit>> ResendVerificationAsync(string? emailAddress, CancellationToken ct)
    {
        var user = string.IsNullOrWhiteSpace(emailAddress) ? null : await users.FindByEmailAsync(emailAddress.Trim());
        if (user is { EmailConfirmed: false })
        {
            var token = await NewEmailTokenAsync(user, UserTokenPurposes.VerifyEmail, TimeSpan.FromHours(_auth.VerifyEmailHours), ct);
            await mailQueue.EnqueueAsync(AuthEmails.VerifyEmail(user.Email, user.DisplayName, Link("verify-email", token), _auth.VerifyEmailHours), ct);
        }

        return Result<Unit>.Ok(Unit.Value);
    }

    // ------------------------------------------------------------------ sign in

    public async Task<Result<AuthSession>> LoginAsync(string? emailAddress, string? password, ClientInfo client, CancellationToken ct)
    {
        var user = string.IsNullOrWhiteSpace(emailAddress) ? null : await users.FindByEmailAsync(emailAddress.Trim());
        if (user is null || string.IsNullOrEmpty(password))
        {
            _ = users.PasswordHasher.HashPassword(new AppUser(), password ?? "x"); // equalise timing with a real check
            return Result<AuthSession>.Fail(ErrorKind.Unauthorized, "invalid_credentials", "Email or password is incorrect.");
        }

        if (await users.IsLockedOutAsync(user))
        {
            return Result<AuthSession>.Fail(ErrorKind.TooManyRequests, "locked_out", $"Too many failed attempts. Try again in {_auth.LockoutMinutes} minutes or reset your password.");
        }

        if (!await users.CheckPasswordAsync(user, password))
        {
            await users.AccessFailedAsync(user);
            return Result<AuthSession>.Fail(ErrorKind.Unauthorized, "invalid_credentials", "Email or password is incorrect.");
        }

        await users.ResetAccessFailedCountAsync(user);
        if (_auth.RequireConfirmedEmail && !user.EmailConfirmed)
        {
            return Result<AuthSession>.Fail(ErrorKind.Forbidden, "email_not_verified", "Confirm your email address first. We can send the link again.");
        }

        return Result<AuthSession>.Ok(await StartSessionAsync(user, familyId: null, familyExpiresAt: null, client, ct));
    }

    public async Task<Result<AuthSession>> RefreshAsync(string? refreshToken, ClientInfo client, CancellationToken ct)
    {
        var invalid = Result<AuthSession>.Fail(ErrorKind.Unauthorized, "invalid_refresh_token", "Please sign in again.");
        if (string.IsNullOrEmpty(refreshToken)) return invalid;

        var now = clock.GetUtcNow();
        var stored = await refreshTokens.FindByHashAsync(TokenHasher.Hash(refreshToken), ct);
        if (stored is null || stored.RevokedAt is not null || stored.FamilyExpiresAt <= now) return invalid;

        if (stored.UsedAt is not null)
        {
            if (now - stored.UsedAt.Value <= TimeSpan.FromSeconds(_auth.RefreshReuseGraceSeconds))
            {
                // Two tabs raced; the first one already got the new token. Do not punish, ask to retry.
                return Result<AuthSession>.Fail(ErrorKind.Conflict, "refresh_in_progress", "Refresh already happened; retry with the newest token.");
            }

            await refreshTokens.RevokeFamilyAsync(stored.FamilyId, now, ct); // a spent token came back later: assume theft
            return Result<AuthSession>.Fail(ErrorKind.Unauthorized, "refresh_token_reused", "Please sign in again.");
        }

        if (stored.ExpiresAt <= now) return invalid;
        if (!await refreshTokens.TryMarkUsedAsync(stored.Id, now, ct))
        {
            return Result<AuthSession>.Fail(ErrorKind.Conflict, "refresh_in_progress", "Refresh already happened; retry with the newest token.");
        }

        var user = await userRepo.FindByIdAsync(stored.UserId, ct);
        if (user is null || (_auth.RequireConfirmedEmail && !user.EmailConfirmed)) return invalid;
        return Result<AuthSession>.Ok(await StartSessionAsync(user, stored.FamilyId, stored.FamilyExpiresAt, client, ct));
    }

    public async Task<Result<Unit>> LogoutAsync(string? refreshToken, CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(refreshToken) && await refreshTokens.FindByHashAsync(TokenHasher.Hash(refreshToken), ct) is { } stored)
        {
            await refreshTokens.RevokeFamilyAsync(stored.FamilyId, clock.GetUtcNow(), ct);
        }

        return Result<Unit>.Ok(Unit.Value);
    }

    public async Task<Result<Unit>> LogoutEverywhereAsync(Guid userId, CancellationToken ct)
    {
        await refreshTokens.RevokeAllForUserAsync(userId, null, clock.GetUtcNow(), ct);
        return Result<Unit>.Ok(Unit.Value);
    }

    // ---------------------------------------------------------------- passwords

    public async Task<Result<Unit>> ForgotPasswordAsync(string? emailAddress, CancellationToken ct)
    {
        var user = string.IsNullOrWhiteSpace(emailAddress) ? null : await users.FindByEmailAsync(emailAddress.Trim());
        if (user is not null)
        {
            var token = await NewEmailTokenAsync(user, UserTokenPurposes.ResetPassword, TimeSpan.FromMinutes(_auth.ResetPasswordMinutes), ct);
            await mailQueue.EnqueueAsync(AuthEmails.ResetPassword(user.Email, user.DisplayName, Link("reset-password", token), _auth.ResetPasswordMinutes), ct);
        }

        return Result<Unit>.Ok(Unit.Value); // identical answer either way
    }

    public async Task<Result<Unit>> ResetPasswordAsync(string? token, string? newPassword, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(newPassword)) return Result<Unit>.Fail(ErrorKind.Validation, "weak_password", "Choose a new password.");
        var (user, userToken) = await PeekTokenAsync(token, UserTokenPurposes.ResetPassword, ct);
        if (user is null || userToken is null) return InvalidLink();

        // Check the password first so a typo does not burn the one-time link.
        foreach (var validator in users.PasswordValidators)
        {
            var check = await validator.ValidateAsync(users, user, newPassword);
            if (!check.Succeeded) return PasswordProblem(check);
        }

        if (!await userTokens.TryMarkUsedAsync(userToken.Id, clock.GetUtcNow(), ct)) return InvalidLink();

        if (user.PasswordHash is not null) await users.RemovePasswordAsync(user);
        var set = await users.AddPasswordAsync(user, newPassword);
        if (!set.Succeeded) return PasswordProblem(set);

        user.EmailConfirmed = true; // they received the mail, so the address is theirs
        await users.UpdateAsync(user);
        await users.ResetAccessFailedCountAsync(user);
        await users.SetLockoutEndDateAsync(user, null);
        await refreshTokens.RevokeAllForUserAsync(user.Id, null, clock.GetUtcNow(), ct);
        await mailQueue.EnqueueAsync(AuthEmails.PasswordChanged(user.Email, user.DisplayName), ct);
        return Result<Unit>.Ok(Unit.Value);
    }

    public async Task<Result<Unit>> ChangePasswordAsync(Guid userId, string? current, string? newPassword, Guid currentSessionId, CancellationToken ct)
    {
        var user = await userRepo.FindByIdAsync(userId, ct);
        if (user is null) return NoUser();
        if (string.IsNullOrEmpty(current) || string.IsNullOrEmpty(newPassword)) return Result<Unit>.Fail(ErrorKind.Validation, "weak_password", "Enter your current and new password.");
        if (user.PasswordHash is null || !await users.CheckPasswordAsync(user, current))
        {
            return Result<Unit>.Fail(ErrorKind.Validation, "wrong_password", "Your current password is incorrect.");
        }

        var changed = await users.ChangePasswordAsync(user, current, newPassword);
        if (!changed.Succeeded) return PasswordProblem(changed);

        await refreshTokens.RevokeAllForUserAsync(user.Id, currentSessionId, clock.GetUtcNow(), ct);
        await mailQueue.EnqueueAsync(AuthEmails.PasswordChanged(user.Email, user.DisplayName), ct);
        return Result<Unit>.Ok(Unit.Value);
    }

    // ------------------------------------------------------------------ profile

    public async Task<Result<UserProfile>> GetProfileAsync(Guid userId, CancellationToken ct)
    {
        var user = await userRepo.FindByIdAsync(userId, ct);
        return user is null ? Result<UserProfile>.Fail(ErrorKind.NotFound, "user_not_found", "Account not found.") : Result<UserProfile>.Ok(UserProfile.From(user));
    }

    public async Task<Result<UserProfile>> UpdateProfileAsync(Guid userId, ProfileUpdate update, CancellationToken ct)
    {
        var user = await userRepo.FindByIdAsync(userId, ct);
        if (user is null) return Result<UserProfile>.Fail(ErrorKind.NotFound, "user_not_found", "Account not found.");

        var name = update.DisplayName?.Trim();
        var country = update.Country?.Trim().ToUpperInvariant();
        var method = string.IsNullOrWhiteSpace(update.CubeMethod) ? null : update.CubeMethod.Trim().ToLowerInvariant();
        var model = string.IsNullOrWhiteSpace(update.CubeModel) ? null : update.CubeModel.Trim();
        var problem =
            (name is null ? null : ProfileValidator.DisplayName(name)) ??
            (country is null ? null : ProfileValidator.Country(country)) ??
            ProfileValidator.CubeMethod(method) ??
            ProfileValidator.CubeModel(model) ??
            ProfileValidator.CubingYears(update.CubingYears);
        if (problem is not null) return Result<UserProfile>.Fail(ErrorKind.Validation, "invalid_profile", problem);

        if (name is not null) user.DisplayName = name;
        if (country is not null) user.Country = country;
        if (method is not null) user.CubeMethod = method;
        else if (update.ClearCubeMethod) user.CubeMethod = null;
        if (model is not null) user.CubeModel = model;
        else if (update.ClearCubeModel) user.CubeModel = null;
        if (update.CubingYears is { } years) user.CubingSinceYear = clock.GetUtcNow().Year - years;
        else if (update.ClearCubingYears) user.CubingSinceYear = null;
        if (update.LeaderboardOptIn is { } optIn) user.LeaderboardOptIn = optIn;

        var saved = await users.UpdateAsync(user);
        return saved.Succeeded ? Result<UserProfile>.Ok(UserProfile.From(user)) : Result<UserProfile>.Fail(ErrorKind.Conflict, "update_failed", "Could not save your changes.");
    }

    /// <param name="password">Required for accounts that have a password.</param>
    /// <param name="confirmHandle">Accounts that only use social login confirm by typing their username instead.</param>
    public async Task<Result<Unit>> DeleteAccountAsync(Guid userId, string? password, string? confirmHandle, CancellationToken ct)
    {
        var user = await userRepo.FindByIdAsync(userId, ct);
        if (user is null) return NoUser();
        if (user.PasswordHash is null)
        {
            if (!string.Equals(confirmHandle?.Trim(), user.Handle, StringComparison.OrdinalIgnoreCase))
            {
                return Result<Unit>.Fail(ErrorKind.Validation, "wrong_confirmation", "Type your username to confirm.");
            }
        }
        else if (string.IsNullOrEmpty(password) || !await users.CheckPasswordAsync(user, password))
        {
            return Result<Unit>.Fail(ErrorKind.Validation, "wrong_password", "Your password is incorrect.");
        }

        await users.DeleteAsync(user); // refresh and email tokens go with it (ON DELETE CASCADE)
        return Result<Unit>.Ok(Unit.Value);
    }

    // ----------------------------------------------------------------- sessions

    public async Task<Result<IReadOnlyList<SessionInfo>>> ListSessionsAsync(Guid userId, Guid currentSessionId, CancellationToken ct)
    {
        var active = await refreshTokens.ListActiveSessionsAsync(userId, clock.GetUtcNow(), ct);
        IReadOnlyList<SessionInfo> list = active
            .Select(t => new SessionInfo(t.FamilyId, t.FamilyExpiresAt.AddDays(-_auth.SessionMaxDays), t.CreatedAt, t.UserAgent, t.Ip, t.FamilyId == currentSessionId))
            .OrderByDescending(s => s.LastActiveAt)
            .ToList();
        return Result<IReadOnlyList<SessionInfo>>.Ok(list);
    }

    public async Task<Result<Unit>> RevokeSessionAsync(Guid userId, Guid sessionId, CancellationToken ct)
    {
        var active = await refreshTokens.ListActiveSessionsAsync(userId, clock.GetUtcNow(), ct);
        if (active.All(t => t.FamilyId != sessionId)) return Result<Unit>.Fail(ErrorKind.NotFound, "session_not_found", "Session not found.");
        await refreshTokens.RevokeFamilyAsync(sessionId, clock.GetUtcNow(), ct);
        return Result<Unit>.Ok(Unit.Value);
    }

    // ------------------------------------------------------------------ helpers

    /// <summary>Starts a brand-new sign-in for a user whose identity was already proven (used by social login).</summary>
    internal Task<AuthSession> StartSignInAsync(AppUser user, ClientInfo client, CancellationToken ct) =>
        StartSessionAsync(user, familyId: null, familyExpiresAt: null, client, ct);

    internal async Task SendVerificationEmailAsync(AppUser user, CancellationToken ct)
    {
        var token = await NewEmailTokenAsync(user, UserTokenPurposes.VerifyEmail, TimeSpan.FromHours(_auth.VerifyEmailHours), ct);
        await mailQueue.EnqueueAsync(AuthEmails.VerifyEmail(user.Email, user.DisplayName, Link("verify-email", token), _auth.VerifyEmailHours), ct);
    }

    private async Task<AuthSession> StartSessionAsync(AppUser user, Guid? familyId, DateTimeOffset? familyExpiresAt, ClientInfo client, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var family = familyId ?? Guid.CreateVersion7();
        var familyEnd = familyExpiresAt ?? now.AddDays(_auth.SessionMaxDays);
        var expires = now.AddDays(_auth.RefreshTokenDays);
        if (expires > familyEnd) expires = familyEnd;

        var plain = TokenHasher.NewToken();
        await refreshTokens.AddAsync(new RefreshToken
        {
            Id = Guid.CreateVersion7(),
            UserId = user.Id,
            FamilyId = family,
            TokenHash = TokenHasher.Hash(plain),
            CreatedAt = now,
            ExpiresAt = expires,
            FamilyExpiresAt = familyEnd,
            UserAgent = Truncate(client.UserAgent, 256),
            Ip = Truncate(client.Ip, 45),
        }, ct);

        return new AuthSession(accessTokens.Issue(user, family), plain, expires, family, UserProfile.From(user));
    }

    private async Task<string> NewEmailTokenAsync(AppUser user, string purpose, TimeSpan lifetime, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        await userTokens.InvalidateAsync(user.Id, purpose, now, ct); // only the newest email works
        var plain = TokenHasher.NewToken();
        await userTokens.AddAsync(new UserToken
        {
            Id = Guid.CreateVersion7(),
            UserId = user.Id,
            Purpose = purpose,
            TokenHash = TokenHasher.Hash(plain),
            CreatedAt = now,
            ExpiresAt = now.Add(lifetime),
        }, ct);
        return plain;
    }

    /// <summary>Looks the token up without consuming it.</summary>
    private async Task<(AppUser? User, UserToken? Token)> PeekTokenAsync(string? token, string purpose, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(token)) return (null, null);
        var stored = await userTokens.FindByHashAsync(TokenHasher.Hash(token), ct);
        if (stored is null || stored.Purpose != purpose || stored.UsedAt is not null || stored.ExpiresAt <= clock.GetUtcNow()) return (null, null);
        var user = await userRepo.FindByIdAsync(stored.UserId, ct);
        return user is null ? (null, null) : (user, stored);
    }

    private async Task<(AppUser? User, UserToken? Token)> ConsumeTokenAsync(string? token, string purpose, CancellationToken ct)
    {
        var (user, stored) = await PeekTokenAsync(token, purpose, ct);
        if (user is null || stored is null) return (null, null);
        return await userTokens.TryMarkUsedAsync(stored.Id, clock.GetUtcNow(), ct) ? (user, stored) : (null, null);
    }

    private string Link(string page, string token) => $"{_web.BaseUrl.TrimEnd('/')}/auth/{page}?token={Uri.EscapeDataString(token)}";

    private static Result<Unit> InvalidLink() =>
        Result<Unit>.Fail(ErrorKind.Validation, "invalid_token", "This link is invalid or has expired. Request a new one.");

    private static Result<Unit> NoUser() => Result<Unit>.Fail(ErrorKind.NotFound, "user_not_found", "Account not found.");

    private static Result<Unit> PasswordProblem(IdentityResult result)
    {
        var messages = result.Errors.Select(e => e.Description).ToList();
        return Result<Unit>.Fail(ErrorKind.Validation, "weak_password", messages.FirstOrDefault() ?? "Choose a stronger password.", messages);
    }

    private static string? Truncate(string? value, int max) => value is null || value.Length <= max ? value : value[..max];
}
