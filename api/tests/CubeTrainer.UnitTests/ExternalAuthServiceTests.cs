using CubeTrainer.Application.Auth;
using CubeTrainer.Application.Auth.External;

namespace CubeTrainer.UnitTests;

public class ExternalAuthServiceTests
{
    private static ExternalProfile Google(string subject = "g-1", string? email = "new@example.com", bool verified = true, string? name = "New Person") =>
        new("google", subject, email, verified, name);

    private static CompleteExternalRequest Complete(string ticket, string? email = null, string handle = "social_user") =>
        new(ticket, email, null, handle, "IN", 1995, null, null, null, true);

    private static async Task<T> Outcome<T>(AuthFixture f, ExternalProfile p, Guid? link = null) where T : ExternalOutcome
    {
        var r = await f.External.SignInAsync(p, link, AuthFixture.Client(), default);
        Assert.True(r.IsSuccess);
        return Assert.IsType<T>(r.Value);
    }

    [Fact]
    public async Task A_new_person_is_sent_to_finish_sign_up_then_gets_a_session_without_a_password()
    {
        var f = new AuthFixture();
        var needs = await Outcome<ExternalNeedsProfile>(f, Google());

        var done = await f.External.CompleteAsync(Complete(f.External.IssueTicket(needs.Profile)), AuthFixture.Client(), default);
        Assert.True(done.IsSuccess);
        Assert.NotNull(done.Value!.Session);
        Assert.True(done.Value.Session!.User.EmailConfirmed);
        Assert.Equal("New Person", done.Value.Session.User.DisplayName);

        // the same Google account now signs straight in
        var again = await Outcome<ExternalSignedIn>(f, Google());
        Assert.Equal(done.Value.Session.User.Id, again.Session.User.Id);
        // and no password login exists for it
        Assert.False((await f.Auth.LoginAsync("new@example.com", "anything at all", AuthFixture.Client(), default)).IsSuccess);
    }

    [Fact]
    public async Task Finish_sign_up_enforces_the_same_rules_as_registration()
    {
        var f = new AuthFixture();
        var ticket = f.External.IssueTicket(Google());
        Assert.Equal("invalid_registration", (await f.External.CompleteAsync(Complete(ticket, handle: "x"), AuthFixture.Client(), default)).Error!.Code);
        Assert.Equal("invalid_registration", (await f.External.CompleteAsync(Complete(ticket) with { BirthYear = 2020 }, AuthFixture.Client(), default)).Error!.Code);
        Assert.Equal("invalid_registration", (await f.External.CompleteAsync(Complete(ticket) with { AcceptTerms = false }, AuthFixture.Client(), default)).Error!.Code);
        Assert.Equal("invalid_ticket", (await f.External.CompleteAsync(Complete("not-a-ticket"), AuthFixture.Client(), default)).Error!.Code);
    }

    [Fact]
    public async Task An_expired_ticket_is_refused()
    {
        var f = new AuthFixture();
        var ticket = f.External.IssueTicket(Google());
        f.Clock.Advance(TimeSpan.FromMinutes(31));
        Assert.Equal("invalid_ticket", (await f.External.CompleteAsync(Complete(ticket), AuthFixture.Client(), default)).Error!.Code);
    }

    [Fact]
    public async Task A_taken_username_is_reported()
    {
        var f = new AuthFixture();
        await f.RegisteredAndSignedInAsync("other@example.com", "social_user");
        var ticket = f.External.IssueTicket(Google());
        Assert.Equal("handle_taken", (await f.External.CompleteAsync(Complete(ticket), AuthFixture.Client(), default)).Error!.Code);
    }

    [Fact]
    public async Task A_provider_without_an_email_asks_for_one_and_requires_verification()
    {
        var f = new AuthFixture();
        var needs = await Outcome<ExternalNeedsProfile>(f, Google(email: null, verified: false));
        var ticket = f.External.IssueTicket(needs.Profile);

        Assert.Equal("invalid_registration", (await f.External.CompleteAsync(Complete(ticket), AuthFixture.Client(), default)).Error!.Code);
        var done = await f.External.CompleteAsync(Complete(ticket, email: "typed@example.com"), AuthFixture.Client(), default);
        Assert.True(done.IsSuccess);
        Assert.Null(done.Value!.Session); // typed-in email is unproven: confirm it first
        Assert.Contains(f.Mail.Sent, m => m.ToAddress == "typed@example.com");
    }

    [Fact]
    public async Task A_verified_email_on_a_confirmed_password_account_links_and_signs_in()
    {
        var f = new AuthFixture();
        var existing = await f.RegisteredAndSignedInAsync("sub@example.com", "cuber_sub");
        var signedIn = await Outcome<ExternalSignedIn>(f, Google(email: "sub@example.com"));
        Assert.Equal(existing.User.Id, signedIn.Session.User.Id);
        Assert.True((await f.Auth.LoginAsync("sub@example.com", AuthFixture.Password, AuthFixture.Client(), default)).IsSuccess); // password still works
    }

    [Fact]
    public async Task An_unverified_provider_email_never_auto_links()
    {
        var f = new AuthFixture();
        await f.RegisteredAndSignedInAsync("sub@example.com", "cuber_sub");
        var r = await f.External.SignInAsync(Google(email: "sub@example.com", verified: false), null, AuthFixture.Client(), default);
        Assert.Equal("email_in_use", r.Error!.Code);
    }

    [Fact]
    public async Task The_verified_owner_takes_over_an_unconfirmed_squatter_account()
    {
        var f = new AuthFixture();
        await f.Auth.RegisterAsync(AuthFixture.NewUser("victim@example.com", "squatter"), default); // attacker, never confirmed

        var signedIn = await Outcome<ExternalSignedIn>(f, Google(email: "victim@example.com"));
        Assert.True(signedIn.Session.User.EmailConfirmed);
        // the squatter's password no longer works
        Assert.False((await f.Auth.LoginAsync("victim@example.com", AuthFixture.Password, AuthFixture.Client(), default)).IsSuccess);
    }

    [Fact]
    public async Task Connecting_from_settings_links_once_and_rejects_someone_elses_identity()
    {
        var f = new AuthFixture();
        var a = await f.RegisteredAndSignedInAsync("a@example.com", "user_a");
        var b = await f.RegisteredAndSignedInAsync("b@example.com", "user_b");

        await Outcome<ExternalLinked>(f, Google("g-shared", "a@example.com"), a.User.Id);
        var clash = await f.External.SignInAsync(Google("g-shared", "b@example.com"), b.User.Id, AuthFixture.Client(), default);
        Assert.Equal("identity_in_use", clash.Error!.Code);

        var list = (await f.External.ListAsync(a.User.Id, default)).Value!;
        Assert.True(list.HasPassword);
        Assert.Equal(["google"], list.Linked.Select(l => l.Provider).ToArray());
    }

    [Fact]
    public async Task You_cannot_remove_your_last_way_to_sign_in()
    {
        var f = new AuthFixture();
        var needs = await Outcome<ExternalNeedsProfile>(f, Google());
        var session = (await f.External.CompleteAsync(Complete(f.External.IssueTicket(needs.Profile)), AuthFixture.Client(), default)).Value!.Session!;

        Assert.Equal("last_sign_in_method", (await f.External.UnlinkAsync(session.User.Id, "google", default)).Error!.Code);
        Assert.Equal("identity_not_found", (await f.External.UnlinkAsync(session.User.Id, "github", default)).Error!.Code);

        // with a password set (via the reset flow) it can go
        await f.Auth.ForgotPasswordAsync("new@example.com", default);
        Assert.True((await f.Auth.ResetPasswordAsync(f.Mail.TokenFrom("Reset your"), "a brand new passphrase", default)).IsSuccess);
        Assert.True((await f.External.UnlinkAsync(session.User.Id, "google", default)).IsSuccess);
    }

    [Fact]
    public async Task A_social_only_account_deletes_itself_by_typing_its_username()
    {
        var f = new AuthFixture();
        var needs = await Outcome<ExternalNeedsProfile>(f, Google());
        var session = (await f.External.CompleteAsync(Complete(f.External.IssueTicket(needs.Profile)), AuthFixture.Client(), default)).Value!.Session!;

        Assert.Equal("wrong_confirmation", (await f.Auth.DeleteAccountAsync(session.User.Id, null, "nope", default)).Error!.Code);
        Assert.True((await f.Auth.DeleteAccountAsync(session.User.Id, null, "SOCIAL_USER", default)).IsSuccess);
    }
}
