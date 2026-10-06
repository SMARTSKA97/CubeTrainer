using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Auth.TwoFactor;
using CubeTrainer.Application.Common;
using CubeTrainer.Domain.Users;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace CubeTrainer.Application.Auth.External;

/// <summary>
/// Social login rules. The important ones:
/// - a provider account is matched by its stable subject id, never by email alone;
/// - an existing password account is only auto-linked when BOTH sides have verified the email; otherwise the person must sign in
///   first and connect the provider in Settings (stops "I registered with your email and then you logged in with Google" takeovers);
/// - a never-confirmed account with that email is taken over by the verified owner and its password is removed;
/// - the last way to sign in can't be removed.
/// </summary>
public sealed class ExternalAuthService(
    UserManager<AppUser> users,
    IUserRepository userRepo,
    IExternalLoginRepository logins,
    IRefreshTokenRepository refreshTokens,
    AuthService auth,
    ITwoFactorChallenge challenges,
    IExternalTicketProtector tickets,
    IOptions<AuthOptions> authOptions,
    TimeProvider clock)
{
    public static readonly TimeSpan TicketLifetime = TimeSpan.FromMinutes(30);
    private readonly AuthOptions _auth = authOptions.Value;

    /// <param name="linkUserId">Set when a signed-in user is connecting a provider rather than signing in.</param>
    public async Task<Result<ExternalOutcome>> SignInAsync(ExternalProfile profile, Guid? linkUserId, ClientInfo client, CancellationToken ct)
    {
        var existing = await logins.FindAsync(profile.Provider, profile.Subject, ct);

        if (linkUserId is { } linking)
        {
            if (existing is not null)
            {
                return existing.UserId == linking
                    ? Ok(new ExternalLinked(profile.Provider))
                    : Fail(ErrorKind.Conflict, "identity_in_use", "That account is already connected to a different CubeTrainer account.");
            }

            var added = await logins.TryAddAsync(NewLogin(linking, profile), ct);
            return added
                ? Ok(new ExternalLinked(profile.Provider))
                : Fail(ErrorKind.Conflict, "identity_in_use", "You already connected an account from this provider, or it belongs to someone else.");
        }

        if (existing is not null)
        {
            var owner = await userRepo.FindByIdAsync(existing.UserId, ct);
            return owner is null
                ? Fail(ErrorKind.NotFound, "user_not_found", "Account not found.")
                : await SignedInOrChallengeAsync(owner, client, ct);
        }

        if (profile.Email is not null && await users.FindByEmailAsync(profile.Email) is { } sameEmail)
        {
            if (!profile.EmailVerified)
            {
                return Fail(ErrorKind.Conflict, "email_in_use", "An account with this email already exists. Sign in with your password, then connect the provider in Settings.");
            }

            if (!sameEmail.EmailConfirmed)
            {
                // Nobody ever proved they own this address, but the provider just did: the real owner wins. Drop any password
                // an impostor set, and sign out whatever sessions it created.
                sameEmail.EmailConfirmed = true;
                await users.UpdateAsync(sameEmail);
                if (sameEmail.PasswordHash is not null) await users.RemovePasswordAsync(sameEmail);
                await refreshTokens.RevokeAllForUserAsync(sameEmail.Id, null, clock.GetUtcNow(), ct);
            }

            if (!await logins.TryAddAsync(NewLogin(sameEmail.Id, profile), ct))
            {
                return Fail(ErrorKind.Conflict, "identity_in_use", "This account is already connected elsewhere.");
            }

            return await SignedInOrChallengeAsync(sameEmail, client, ct);
        }

        return Ok(new ExternalNeedsProfile(profile));
    }

    public string IssueTicket(ExternalProfile profile) => tickets.Protect(profile, TicketLifetime);

    public Result<ExternalProfile> ReadTicket(string? ticket)
    {
        var profile = string.IsNullOrEmpty(ticket) ? null : tickets.Unprotect(ticket);
        return profile is null
            ? Result<ExternalProfile>.Fail(ErrorKind.Validation, "invalid_ticket", "This sign-up link has expired. Start again.")
            : Result<ExternalProfile>.Ok(profile);
    }

    /// <summary>Creates the account after the person filled in the profile fields we need (handle, country, birth year, terms).</summary>
    public async Task<Result<ExternalCompleted>> CompleteAsync(CompleteExternalRequest req, ClientInfo client, CancellationToken ct)
    {
        var ticket = ReadTicket(req.Ticket);
        if (!ticket.IsSuccess) return Result<ExternalCompleted>.Fail(ticket.Error!.Kind, ticket.Error.Code, ticket.Error.Message);
        var profile = ticket.Value!;

        var now = clock.GetUtcNow();
        var email = (profile.Email ?? req.Email)?.Trim();
        var handle = req.Handle?.Trim();
        var name = (string.IsNullOrWhiteSpace(req.DisplayName) ? profile.Name : req.DisplayName)?.Trim();
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
            req.AcceptTerms ? null : "You need to accept the terms and privacy policy.",
        }.Where(p => p is not null).Select(p => p!).ToList();
        if (problems.Count > 0) return Result<ExternalCompleted>.Fail(ErrorKind.Validation, "invalid_registration", problems[0], problems);

        if (await userRepo.FindByNormalizedEmailAsync(users.NormalizeEmail(email!), ct) is not null)
        {
            return Result<ExternalCompleted>.Fail(ErrorKind.Conflict, "email_in_use", "An account with this email already exists. Sign in with your password, then connect the provider in Settings.");
        }

        if (await userRepo.FindByNormalizedHandleAsync(users.NormalizeName(handle!), ct) is not null)
        {
            return Result<ExternalCompleted>.Fail(ErrorKind.Conflict, "handle_taken", "That username is taken.");
        }

        // The provider's verification only covers the email it gave us, not one the person typed in.
        var verified = profile.Email is not null && profile.EmailVerified;
        var user = new AppUser
        {
            Id = Guid.CreateVersion7(),
            Email = email!,
            EmailConfirmed = verified,
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
        var created = await users.CreateAsync(user); // no password: this account signs in through the provider
        if (!created.Succeeded)
        {
            var taken = created.Errors.Any(e => e.Code is "DuplicateUserName" or "DuplicateEmail" or "DuplicateUser");
            return taken
                ? Result<ExternalCompleted>.Fail(ErrorKind.Conflict, "handle_taken", "That username or email is already in use.")
                : Result<ExternalCompleted>.Fail(ErrorKind.Validation, "invalid_registration", created.Errors.First().Description);
        }

        if (!await logins.TryAddAsync(NewLogin(user.Id, profile), ct))
        {
            await users.DeleteAsync(user);
            return Result<ExternalCompleted>.Fail(ErrorKind.Conflict, "identity_in_use", "This account is already connected elsewhere.");
        }

        if (!verified)
        {
            await auth.SendVerificationEmailAsync(user, ct);
            return Result<ExternalCompleted>.Ok(new ExternalCompleted(null));
        }

        return Result<ExternalCompleted>.Ok(new ExternalCompleted(await auth.StartSignInAsync(user, client, ct)));
    }

    // ------------------------------------------------------------- manage links

    public async Task<Result<IdentitiesView>> ListAsync(Guid userId, CancellationToken ct)
    {
        var user = await userRepo.FindByIdAsync(userId, ct);
        if (user is null) return Result<IdentitiesView>.Fail(ErrorKind.NotFound, "user_not_found", "Account not found.");
        var list = (await logins.ListForUserAsync(userId, ct)).Select(l => new LinkedIdentity(l.Provider, l.Email, l.CreatedAt)).ToList();
        return Result<IdentitiesView>.Ok(new IdentitiesView(user.PasswordHash is not null, list));
    }

    public async Task<Result<Unit>> UnlinkAsync(Guid userId, string provider, CancellationToken ct)
    {
        var user = await userRepo.FindByIdAsync(userId, ct);
        if (user is null) return Result<Unit>.Fail(ErrorKind.NotFound, "user_not_found", "Account not found.");
        var linked = await logins.ListForUserAsync(userId, ct);
        if (linked.All(l => l.Provider != provider)) return Result<Unit>.Fail(ErrorKind.NotFound, "identity_not_found", "That provider is not connected.");
        if (user.PasswordHash is null && linked.Count <= 1)
        {
            return Result<Unit>.Fail(ErrorKind.Conflict, "last_sign_in_method", "This is your only way to sign in. Set a password first (use \"Forgot password\"), then disconnect it.");
        }

        await logins.DeleteAsync(userId, provider, ct);
        return Result<Unit>.Ok(Unit.Value);
    }

    /// <summary>Provider sign-in must not be a way around two-step verification.</summary>
    private async Task<Result<ExternalOutcome>> SignedInOrChallengeAsync(AppUser user, ClientInfo client, CancellationToken ct) =>
        user.TwoFactorEnabled
            ? Ok(new ExternalTwoFactorRequired(challenges.Issue(user.Id, AuthService.ChallengeLifetime)))
            : Ok(new ExternalSignedIn(await auth.StartSignInAsync(user, client, ct)));

    private ExternalLogin NewLogin(Guid userId, ExternalProfile p) => new()
    {
        Id = Guid.CreateVersion7(),
        UserId = userId,
        Provider = p.Provider,
        Subject = p.Subject,
        Email = p.Email,
        CreatedAt = clock.GetUtcNow(),
    };

    private static Result<ExternalOutcome> Ok(ExternalOutcome outcome) => Result<ExternalOutcome>.Ok(outcome);

    private static Result<ExternalOutcome> Fail(ErrorKind kind, string code, string message) => Result<ExternalOutcome>.Fail(kind, code, message);
}
