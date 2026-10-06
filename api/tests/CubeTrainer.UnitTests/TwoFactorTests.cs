using CubeTrainer.Application.Auth;
using CubeTrainer.Application.Auth.External;
using CubeTrainer.Application.Auth.TwoFactor;

namespace CubeTrainer.UnitTests;

public class TotpTests
{
    private static readonly byte[] Rfc = "12345678901234567890"u8.ToArray();

    [Theory]
    [InlineData(59L, "287082")]          // RFC 6238 appendix B (SHA-1), last six digits of the 8-digit vectors
    [InlineData(1111111109L, "081804")]
    [InlineData(1111111111L, "050471")]
    [InlineData(1234567890L, "005924")]
    [InlineData(2000000000L, "279037")]
    public void Matches_the_RFC_6238_test_vectors(long unixSeconds, string expected) =>
        Assert.Equal(expected, Totp.Code(Rfc, Totp.StepAt(DateTimeOffset.FromUnixTimeSeconds(unixSeconds))));

    [Fact]
    public void Accepts_one_step_of_clock_drift_but_not_two()
    {
        var now = DateTimeOffset.FromUnixTimeSeconds(1_700_000_000);
        var step = Totp.StepAt(now);
        Assert.Equal(step, Totp.Match(Rfc, Totp.Code(Rfc, step), now, null));
        Assert.Equal(step - 1, Totp.Match(Rfc, Totp.Code(Rfc, step - 1), now, null));
        Assert.Equal(step + 1, Totp.Match(Rfc, Totp.Code(Rfc, step + 1), now, null));
        Assert.Null(Totp.Match(Rfc, Totp.Code(Rfc, step - 2), now, null));
        Assert.Null(Totp.Match(Rfc, Totp.Code(Rfc, step + 2), now, null));
    }

    [Fact]
    public void A_code_cannot_be_used_twice_or_after_a_later_one()
    {
        var now = DateTimeOffset.FromUnixTimeSeconds(1_700_000_000);
        var step = Totp.StepAt(now);
        Assert.Null(Totp.Match(Rfc, Totp.Code(Rfc, step), now, step));
        Assert.Null(Totp.Match(Rfc, Totp.Code(Rfc, step - 1), now, step));
        Assert.Equal(step + 1, Totp.Match(Rfc, Totp.Code(Rfc, step + 1), now, step));
    }

    [Fact]
    public void Tolerates_spaces_and_rejects_junk()
    {
        Assert.Equal("123456", Totp.Normalise("123 456"));
        Assert.Null(Totp.Normalise("12345"));
        Assert.Null(Totp.Normalise("abcdef"));
        Assert.Null(Totp.Normalise(null));
    }

    [Fact]
    public void Base32_round_trips_and_the_uri_is_well_formed()
    {
        var secret = Totp.NewSecret();
        Assert.Equal(20, secret.Length);
        Assert.Equal(secret, Totp.FromBase32(Totp.ToBase32(secret)));
        Assert.Equal("GEZDGNBVGY3TQOJQ", Totp.ToBase32("1234567890"u8.ToArray()));
        var uri = Totp.OtpAuthUri("CubeTrainer", "a@b.com", "ABC");
        Assert.StartsWith("otpauth://totp/", uri);
        Assert.Contains("secret=ABC", uri);
        Assert.Contains("issuer=CubeTrainer", uri);
    }

    [Fact]
    public void Recovery_codes_are_distinct_and_normalise_leniently()
    {
        var codes = RecoveryCodes.Generate();
        Assert.Equal(RecoveryCodes.Count, codes.Count);
        Assert.Equal(codes.Count, codes.Distinct().Count());
        Assert.Matches("^[A-Z2-9]{5}-[A-Z2-9]{5}$", codes[0]);
        Assert.Equal(RecoveryCodes.Hash(RecoveryCodes.Normalise(codes[0])!), RecoveryCodes.Hash(RecoveryCodes.Normalise(codes[0].ToLowerInvariant().Replace("-", " "))!));
    }
}

public class TwoFactorServiceTests
{
    private static async Task<(AuthFixture F, AuthSession Session, byte[] Secret, IReadOnlyList<string> Codes)> WithTwoFactorAsync()
    {
        var f = new AuthFixture();
        var session = await f.RegisteredAndSignedInAsync();
        var id = session.User.Id;
        var setup = await f.TwoFactor.BeginSetupAsync(id, AuthFixture.Password, default);
        Assert.True(setup.IsSuccess);
        var secret = Totp.FromBase32(setup.Value!.Secret)!;
        var enabled = await f.TwoFactor.EnableAsync(id, Totp.Code(secret, Totp.StepAt(f.Clock.GetUtcNow())), default);
        Assert.True(enabled.IsSuccess);
        f.Clock.Advance(TimeSpan.FromSeconds(31)); // the enabling code is spent; move on to the next step
        return (f, session, secret, enabled.Value!.Codes);
    }

    private static string Now(AuthFixture f, byte[] secret) => Totp.Code(secret, Totp.StepAt(f.Clock.GetUtcNow()));

    [Fact]
    public async Task Setup_needs_the_password_and_does_not_switch_anything_on_by_itself()
    {
        var f = new AuthFixture();
        var s = await f.RegisteredAndSignedInAsync();
        Assert.False((await f.TwoFactor.BeginSetupAsync(s.User.Id, "wrong password here", default)).IsSuccess);
        var ok = await f.TwoFactor.BeginSetupAsync(s.User.Id, AuthFixture.Password, default);
        Assert.True(ok.IsSuccess);
        Assert.StartsWith("otpauth://totp/", ok.Value!.OtpAuthUri);
        Assert.False((await f.TwoFactor.StatusAsync(s.User.Id, default)).Value!.Enabled);
        // normal login still works until the first code is confirmed
        Assert.NotNull((await f.Auth.PasswordSignInAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default)).Value!.Session);
    }

    [Fact]
    public async Task Enabling_needs_a_right_code_and_hands_out_ten_recovery_codes_once()
    {
        var f = new AuthFixture();
        var s = await f.RegisteredAndSignedInAsync();
        var setup = await f.TwoFactor.BeginSetupAsync(s.User.Id, AuthFixture.Password, default);
        var secret = Totp.FromBase32(setup.Value!.Secret)!;
        Assert.False((await f.TwoFactor.EnableAsync(s.User.Id, "000000", default)).IsSuccess);
        var enabled = await f.TwoFactor.EnableAsync(s.User.Id, Now(f, secret), default);
        Assert.True(enabled.IsSuccess);
        Assert.Equal(RecoveryCodes.Count, enabled.Value!.Codes.Count);
        var status = (await f.TwoFactor.StatusAsync(s.User.Id, default)).Value!;
        Assert.True(status.Enabled);
        Assert.Equal(RecoveryCodes.Count, status.RecoveryCodesLeft);
        Assert.Contains(f.Mail.Sent, m => m.Subject.Contains("two-step", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Password_login_now_returns_a_challenge_and_the_old_login_path_refuses()
    {
        var (f, _, secret, _) = await WithTwoFactorAsync();
        var step1 = await f.Auth.PasswordSignInAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default);
        Assert.True(step1.IsSuccess);
        Assert.Null(step1.Value!.Session);
        Assert.NotNull(step1.Value.Challenge);
        Assert.False((await f.Auth.LoginAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default)).IsSuccess);

        var done = await f.TwoFactor.CompleteSignInAsync(step1.Value.Challenge, Now(f, secret), AuthFixture.Client(), default);
        Assert.True(done.IsSuccess);
        Assert.NotNull(done.Value!.RefreshToken);
    }

    [Fact]
    public async Task A_wrong_password_never_reveals_that_two_step_is_on()
    {
        var (f, _, _, _) = await WithTwoFactorAsync();
        var r = await f.Auth.PasswordSignInAsync("sub@example.com", "not the password", AuthFixture.Client(), default);
        Assert.False(r.IsSuccess);
    }

    [Fact]
    public async Task A_used_code_is_rejected_the_second_time()
    {
        var (f, _, secret, _) = await WithTwoFactorAsync();
        var code = Now(f, secret);
        var c1 = (await f.Auth.PasswordSignInAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default)).Value!.Challenge!;
        Assert.True((await f.TwoFactor.CompleteSignInAsync(c1, code, AuthFixture.Client(), default)).IsSuccess);
        var c2 = (await f.Auth.PasswordSignInAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default)).Value!.Challenge!;
        Assert.False((await f.TwoFactor.CompleteSignInAsync(c2, code, AuthFixture.Client(), default)).IsSuccess);
    }

    [Fact]
    public async Task An_expired_or_made_up_challenge_is_rejected()
    {
        var (f, _, secret, _) = await WithTwoFactorAsync();
        Assert.False((await f.TwoFactor.CompleteSignInAsync("nonsense", Now(f, secret), AuthFixture.Client(), default)).IsSuccess);
        var c = (await f.Auth.PasswordSignInAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default)).Value!.Challenge!;
        f.Clock.Advance(TimeSpan.FromMinutes(6));
        var r = await f.TwoFactor.CompleteSignInAsync(c, Now(f, secret), AuthFixture.Client(), default);
        Assert.False(r.IsSuccess);
        Assert.Equal("challenge_expired", r.Error!.Code);
    }

    [Fact]
    public async Task Wrong_codes_lock_the_account_just_like_wrong_passwords()
    {
        var (f, _, secret, _) = await WithTwoFactorAsync();
        var c = (await f.Auth.PasswordSignInAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default)).Value!.Challenge!;
        for (var i = 0; i < 5; i++) Assert.False((await f.TwoFactor.CompleteSignInAsync(c, "000000", AuthFixture.Client(), default)).IsSuccess);
        var locked = await f.TwoFactor.CompleteSignInAsync(c, Now(f, secret), AuthFixture.Client(), default);
        Assert.False(locked.IsSuccess);
        Assert.Equal("locked_out", locked.Error!.Code);
    }

    [Fact]
    public async Task A_recovery_code_works_exactly_once()
    {
        var (f, s, _, codes) = await WithTwoFactorAsync();
        var c1 = (await f.Auth.PasswordSignInAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default)).Value!.Challenge!;
        Assert.True((await f.TwoFactor.CompleteSignInAsync(c1, codes[0].ToLowerInvariant(), AuthFixture.Client(), default)).IsSuccess);
        var c2 = (await f.Auth.PasswordSignInAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default)).Value!.Challenge!;
        Assert.False((await f.TwoFactor.CompleteSignInAsync(c2, codes[0], AuthFixture.Client(), default)).IsSuccess);
        Assert.Equal(RecoveryCodes.Count - 1, (await f.TwoFactor.StatusAsync(s.User.Id, default)).Value!.RecoveryCodesLeft);
    }

    [Fact]
    public async Task Regenerating_replaces_the_old_codes()
    {
        var (f, s, secret, codes) = await WithTwoFactorAsync();
        var fresh = await f.TwoFactor.RegenerateRecoveryCodesAsync(s.User.Id, Now(f, secret), default);
        Assert.True(fresh.IsSuccess);
        Assert.Empty(fresh.Value!.Codes.Intersect(codes));
        f.Clock.Advance(TimeSpan.FromSeconds(31));
        var c = (await f.Auth.PasswordSignInAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default)).Value!.Challenge!;
        Assert.False((await f.TwoFactor.CompleteSignInAsync(c, codes[1], AuthFixture.Client(), default)).IsSuccess);
        Assert.False((await f.TwoFactor.RegenerateRecoveryCodesAsync(s.User.Id, "000000", default)).IsSuccess);
    }

    [Fact]
    public async Task Disabling_needs_password_and_a_code_then_logins_are_plain_again()
    {
        var (f, s, secret, _) = await WithTwoFactorAsync();
        Assert.False((await f.TwoFactor.DisableAsync(s.User.Id, "wrong password here", Now(f, secret), default)).IsSuccess);
        Assert.False((await f.TwoFactor.DisableAsync(s.User.Id, AuthFixture.Password, "000000", default)).IsSuccess);
        Assert.True((await f.TwoFactor.DisableAsync(s.User.Id, AuthFixture.Password, Now(f, secret), default)).IsSuccess);
        Assert.False((await f.TwoFactor.StatusAsync(s.User.Id, default)).Value!.Enabled);
        Assert.NotNull((await f.Auth.PasswordSignInAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default)).Value!.Session);
    }

    [Fact]
    public async Task Social_sign_in_is_gated_by_two_step_too()
    {
        var (f, _, secret, _) = await WithTwoFactorAsync();
        // same verified Google email links to the confirmed local account, which has 2FA on
        var r = await f.External.SignInAsync(new ExternalProfile("google", "g-9", "sub@example.com", true, "Sub"), null, AuthFixture.Client(), default);
        Assert.True(r.IsSuccess);
        var gate = Assert.IsType<ExternalTwoFactorRequired>(r.Value);
        Assert.True((await f.TwoFactor.CompleteSignInAsync(gate.Challenge, Now(f, secret), AuthFixture.Client(), default)).IsSuccess);
        // next time the existing link is gated as well
        var again = await f.External.SignInAsync(new ExternalProfile("google", "g-9", "sub@example.com", true, "Sub"), null, AuthFixture.Client(), default);
        Assert.IsType<ExternalTwoFactorRequired>(again.Value);
    }
}
