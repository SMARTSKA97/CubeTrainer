using CubeTrainer.Application.Common;

namespace CubeTrainer.UnitTests;

public class AuthServiceTests
{
    [Fact]
    public async Task Register_then_verify_then_login_works_and_login_is_blocked_until_verified()
    {
        var f = new AuthFixture();
        Assert.True((await f.Auth.RegisterAsync(AuthFixture.NewUser(), default)).IsSuccess);

        var early = await f.Auth.LoginAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default);
        Assert.Equal("email_not_verified", early.Error!.Code);

        Assert.True((await f.Auth.VerifyEmailAsync(f.Mail.TokenFrom("Confirm your email"), default)).IsSuccess);
        var session = await f.Auth.LoginAsync("SUB@example.com", AuthFixture.Password, AuthFixture.Client(), default);
        Assert.True(session.IsSuccess);
        Assert.Equal("cuber_sub", session.Value!.User.Handle);
        Assert.Equal(2023, session.Value.User.CubingSinceYear);
        Assert.Equal("IN", session.Value.User.Country);
    }

    [Fact]
    public async Task Verification_link_is_single_use_and_expires()
    {
        var f = new AuthFixture();
        await f.Auth.RegisterAsync(AuthFixture.NewUser(), default);
        var token = f.Mail.TokenFrom("Confirm your email");
        Assert.True((await f.Auth.VerifyEmailAsync(token, default)).IsSuccess);
        Assert.Equal("invalid_token", (await f.Auth.VerifyEmailAsync(token, default)).Error!.Code);

        var g = new AuthFixture();
        await g.Auth.RegisterAsync(AuthFixture.NewUser(), default);
        var late = g.Mail.TokenFrom("Confirm your email");
        g.Clock.Advance(TimeSpan.FromHours(25));
        Assert.Equal("invalid_token", (await g.Auth.VerifyEmailAsync(late, default)).Error!.Code);
    }

    [Fact]
    public async Task Registering_an_existing_email_looks_identical_but_warns_the_owner()
    {
        var f = new AuthFixture();
        await f.Auth.RegisterAsync(AuthFixture.NewUser(), default);
        var again = await f.Auth.RegisterAsync(AuthFixture.NewUser(handle: "someone_else"), default);
        Assert.True(again.IsSuccess);
        Assert.Contains(f.Mail.Sent, m => m.Subject.Contains("already have", StringComparison.OrdinalIgnoreCase));
        Assert.Equal("handle_taken", (await f.Auth.RegisterAsync(AuthFixture.NewUser("other@example.com"), default)).Error!.Code);
    }

    [Theory]
    [InlineData("not-an-email", "cuber_x", "correct horse battery", 1995, "invalid_registration")]
    [InlineData("a@example.com", "x", "correct horse battery", 1995, "invalid_registration")]
    [InlineData("a@example.com", "admin", "correct horse battery", 1995, "invalid_registration")]
    [InlineData("a@example.com", "cuber_x", "correct horse battery", 2020, "invalid_registration")]
    [InlineData("a@example.com", "cuber_x", "short", 1995, "weak_password")]
    [InlineData("cuberone@example.com", "cuber_x", "my-cuberone-passphrase", 1995, "weak_password")]
    public async Task Bad_registrations_are_rejected(string email, string handle, string password, int birthYear, string code)
    {
        var f = new AuthFixture();
        var req = AuthFixture.NewUser(email, handle, password) with { BirthYear = birthYear };
        var r = await f.Auth.RegisterAsync(req, default);
        Assert.Equal(code, r.Error!.Code);
    }

    [Fact]
    public async Task Terms_must_be_accepted_and_minimum_age_is_configurable()
    {
        var f = new AuthFixture();
        Assert.Equal("invalid_registration", (await f.Auth.RegisterAsync(AuthFixture.NewUser() with { AcceptTerms = false }, default)).Error!.Code);

        var strict = new AuthFixture(new() { ["Auth:MinimumAge"] = "18" });
        Assert.False((await strict.Auth.RegisterAsync(AuthFixture.NewUser() with { BirthYear = 2012 }, default)).IsSuccess);
        Assert.True((await strict.Auth.RegisterAsync(AuthFixture.NewUser() with { BirthYear = 2000 }, default)).IsSuccess);
    }

    [Fact]
    public async Task Wrong_credentials_are_indistinguishable_and_five_failures_lock_the_account()
    {
        var f = new AuthFixture();
        await f.RegisteredAndSignedInAsync();

        Assert.Equal("invalid_credentials", (await f.Auth.LoginAsync("ghost@example.com", "whatever whatever", AuthFixture.Client(), default)).Error!.Code);
        for (var i = 0; i < 5; i++)
        {
            Assert.Equal("invalid_credentials", (await f.Auth.LoginAsync("sub@example.com", "wrong password " + i, AuthFixture.Client(), default)).Error!.Code);
        }

        var locked = await f.Auth.LoginAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default);
        Assert.Equal(ErrorKind.TooManyRequests, locked.Error!.Kind);

        // Identity ends the lockout with the wall clock (not TimeProvider); resetting the password also lifts it.
        await f.Auth.ForgotPasswordAsync("sub@example.com", default);
        Assert.True((await f.Auth.ResetPasswordAsync(f.Mail.TokenFrom("Reset your"), "a brand new passphrase", default)).IsSuccess);
        Assert.True((await f.Auth.LoginAsync("sub@example.com", "a brand new passphrase", AuthFixture.Client(), default)).IsSuccess);
    }

    [Fact]
    public async Task Refresh_rotates_the_token_and_keeps_the_same_session()
    {
        var f = new AuthFixture();
        var first = await f.RegisteredAndSignedInAsync();
        var second = (await f.Auth.RefreshAsync(first.RefreshToken, AuthFixture.Client(), default)).Value!;
        Assert.NotEqual(first.RefreshToken, second.RefreshToken);
        Assert.Equal(first.SessionId, second.SessionId);
        Assert.Equal(first.RefreshExpiresAt.Date, second.RefreshExpiresAt.Date);
    }

    [Fact]
    public async Task Replaying_a_spent_refresh_token_revokes_the_whole_session()
    {
        var f = new AuthFixture();
        var first = await f.RegisteredAndSignedInAsync();
        var second = (await f.Auth.RefreshAsync(first.RefreshToken, AuthFixture.Client(), default)).Value!;

        // within the grace window: a race between two tabs, not theft
        var race = await f.Auth.RefreshAsync(first.RefreshToken, AuthFixture.Client(), default);
        Assert.Equal("refresh_in_progress", race.Error!.Code);
        Assert.True((await f.Auth.RefreshAsync(second.RefreshToken, AuthFixture.Client(), default)).IsSuccess);

        f.Clock.Advance(TimeSpan.FromMinutes(5));
        var replay = await f.Auth.RefreshAsync(first.RefreshToken, AuthFixture.Client(), default);
        Assert.Equal("refresh_token_reused", replay.Error!.Code);

        // the attacker's copy and the victim's newest token are both dead now
        Assert.False((await f.Auth.RefreshAsync(second.RefreshToken, AuthFixture.Client(), default)).IsSuccess);
    }

    [Fact]
    public async Task A_session_cannot_be_refreshed_past_its_absolute_lifetime()
    {
        var f = new AuthFixture(new() { ["Auth:SessionMaxDays"] = "60", ["Auth:RefreshTokenDays"] = "30" });
        var session = await f.RegisteredAndSignedInAsync();
        var token = session.RefreshToken;
        for (var i = 0; i < 2; i++)
        {
            f.Clock.Advance(TimeSpan.FromDays(25));
            token = (await f.Auth.RefreshAsync(token, AuthFixture.Client(), default)).Value!.RefreshToken;
        }

        f.Clock.Advance(TimeSpan.FromDays(25)); // day 75 > 60
        Assert.False((await f.Auth.RefreshAsync(token, AuthFixture.Client(), default)).IsSuccess);
    }

    [Fact]
    public async Task Logout_revokes_only_that_session()
    {
        var f = new AuthFixture();
        var laptop = await f.RegisteredAndSignedInAsync(agent: "laptop");
        var phone = (await f.Auth.LoginAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client("phone"), default)).Value!;
        await f.Auth.LogoutAsync(laptop.RefreshToken, default);
        Assert.False((await f.Auth.RefreshAsync(laptop.RefreshToken, AuthFixture.Client(), default)).IsSuccess);
        Assert.True((await f.Auth.RefreshAsync(phone.RefreshToken, AuthFixture.Client(), default)).IsSuccess);
    }

    [Fact]
    public async Task Forgot_password_answers_the_same_for_unknown_emails()
    {
        var f = new AuthFixture();
        await f.RegisteredAndSignedInAsync();
        var before = f.Mail.Sent.Count;
        Assert.True((await f.Auth.ForgotPasswordAsync("ghost@example.com", default)).IsSuccess);
        Assert.Equal(before, f.Mail.Sent.Count);
        Assert.True((await f.Auth.ForgotPasswordAsync("sub@example.com", default)).IsSuccess);
        Assert.Equal(before + 1, f.Mail.Sent.Count);
    }

    [Fact]
    public async Task Reset_password_signs_every_device_out_and_works_once()
    {
        var f = new AuthFixture();
        var session = await f.RegisteredAndSignedInAsync();
        await f.Auth.ForgotPasswordAsync("sub@example.com", default);
        var token = f.Mail.TokenFrom("Reset your");

        Assert.Equal("weak_password", (await f.Auth.ResetPasswordAsync(token, "short", default)).Error!.Code); // does not burn the link
        Assert.True((await f.Auth.ResetPasswordAsync(token, "a brand new passphrase", default)).IsSuccess);
        Assert.Equal("invalid_token", (await f.Auth.ResetPasswordAsync(token, "another passphrase here", default)).Error!.Code);

        Assert.False((await f.Auth.RefreshAsync(session.RefreshToken, AuthFixture.Client(), default)).IsSuccess);
        Assert.False((await f.Auth.LoginAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default)).IsSuccess);
        Assert.True((await f.Auth.LoginAsync("sub@example.com", "a brand new passphrase", AuthFixture.Client(), default)).IsSuccess);
        Assert.Contains(f.Mail.Sent, m => m.Subject.Contains("password was changed", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task A_newer_reset_email_invalidates_the_older_one()
    {
        var f = new AuthFixture();
        await f.RegisteredAndSignedInAsync();
        await f.Auth.ForgotPasswordAsync("sub@example.com", default);
        var older = f.Mail.TokenFrom("Reset your");
        await f.Auth.ForgotPasswordAsync("sub@example.com", default);
        Assert.Equal("invalid_token", (await f.Auth.ResetPasswordAsync(older, "a brand new passphrase", default)).Error!.Code);
        Assert.True((await f.Auth.ResetPasswordAsync(f.Mail.TokenFrom("Reset your"), "a brand new passphrase", default)).IsSuccess);
    }

    [Fact]
    public async Task Change_password_keeps_this_device_and_signs_out_the_others()
    {
        var f = new AuthFixture();
        var laptop = await f.RegisteredAndSignedInAsync(agent: "laptop");
        var phone = (await f.Auth.LoginAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client("phone"), default)).Value!;

        Assert.Equal("wrong_password", (await f.Auth.ChangePasswordAsync(laptop.User.Id, "nope nope nope", "a brand new passphrase", laptop.SessionId, default)).Error!.Code);
        Assert.True((await f.Auth.ChangePasswordAsync(laptop.User.Id, AuthFixture.Password, "a brand new passphrase", laptop.SessionId, default)).IsSuccess);

        Assert.True((await f.Auth.RefreshAsync(laptop.RefreshToken, AuthFixture.Client(), default)).IsSuccess);
        Assert.False((await f.Auth.RefreshAsync(phone.RefreshToken, AuthFixture.Client(), default)).IsSuccess);
    }

    [Fact]
    public async Task Sessions_can_be_listed_and_revoked_but_only_your_own()
    {
        var f = new AuthFixture();
        var laptop = await f.RegisteredAndSignedInAsync(agent: "laptop");
        var phone = (await f.Auth.LoginAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client("phone"), default)).Value!;
        var list = (await f.Auth.ListSessionsAsync(laptop.User.Id, laptop.SessionId, default)).Value!;
        Assert.Equal(2, list.Count);
        Assert.Single(list, s => s.IsCurrent);

        Assert.Equal("session_not_found", (await f.Auth.RevokeSessionAsync(laptop.User.Id, Guid.NewGuid(), default)).Error!.Code);
        Assert.True((await f.Auth.RevokeSessionAsync(laptop.User.Id, phone.SessionId, default)).IsSuccess);
        Assert.Single((await f.Auth.ListSessionsAsync(laptop.User.Id, laptop.SessionId, default)).Value!);
    }

    [Fact]
    public async Task Profile_can_be_edited_and_fields_cleared()
    {
        var f = new AuthFixture();
        var s = await f.RegisteredAndSignedInAsync();
        var updated = (await f.Auth.UpdateProfileAsync(s.User.Id, new(" New Name ", "us", "roux", "MoYu", 10, true, ClearCubingYears: false), default)).Value!;
        Assert.Equal("New Name", updated.DisplayName);
        Assert.Equal("US", updated.Country);
        Assert.Equal("roux", updated.CubeMethod);
        Assert.Equal(2016, updated.CubingSinceYear);
        Assert.True(updated.LeaderboardOptIn);

        var cleared = (await f.Auth.UpdateProfileAsync(s.User.Id, new(null, null, null, null, null, null, ClearCubeMethod: true, ClearCubeModel: true, ClearCubingYears: true), default)).Value!;
        Assert.Null(cleared.CubeMethod);
        Assert.Null(cleared.CubeModel);
        Assert.Null(cleared.CubingSinceYear);
        Assert.Equal("invalid_profile", (await f.Auth.UpdateProfileAsync(s.User.Id, new(null, "ZZ", null, null, null, null), default)).Error!.Code);
    }

    [Fact]
    public async Task Deleting_the_account_needs_the_password_and_removes_everything()
    {
        var f = new AuthFixture();
        var s = await f.RegisteredAndSignedInAsync();
        Assert.Equal("wrong_password", (await f.Auth.DeleteAccountAsync(s.User.Id, "nope nope nope", null, default)).Error!.Code);
        Assert.True((await f.Auth.DeleteAccountAsync(s.User.Id, AuthFixture.Password, null, default)).IsSuccess);
        Assert.Equal("user_not_found", (await f.Auth.GetProfileAsync(s.User.Id, default)).Error!.Code);
        Assert.False((await f.Auth.LoginAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default)).IsSuccess);
        Assert.True((await f.Auth.HandleAvailableAsync("cuber_sub", default)).Value);
    }
}
