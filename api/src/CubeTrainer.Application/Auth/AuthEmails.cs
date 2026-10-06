using System.Net;

namespace CubeTrainer.Application.Auth;

/// <summary>The transactional emails. Plain, inline-styled HTML so every mail client renders it, plus a text part.</summary>
public static class AuthEmails
{
    public static EmailMessage VerifyEmail(string to, string name, string link, int hours) => Build(
        to, name, "Confirm your email for CubeTrainer",
        $"Welcome to CubeTrainer, {name}!",
        "Confirm your email address to finish creating your account.",
        "Confirm email", link,
        $"This link works for {hours} hours and only once. If you did not sign up, you can ignore this email.");

    public static EmailMessage AlreadyRegistered(string to, string name, string resetLink) => Build(
        to, name, "You already have a CubeTrainer account",
        "Someone tried to sign up with your email",
        "There is already a CubeTrainer account for this address. If it was you, just sign in. If you forgot your password, you can reset it.",
        "Reset password", resetLink,
        "If it was not you, no action is needed: nothing was changed.");

    public static EmailMessage ResetPassword(string to, string name, string link, int minutes) => Build(
        to, name, "Reset your CubeTrainer password",
        "Reset your password",
        "We received a request to reset the password for your account.",
        "Choose a new password", link,
        $"This link works for {minutes} minutes and only once. If you did not ask for it, ignore this email: your password stays the same.");

    public static EmailMessage PasswordChanged(string to, string name) => Build(
        to, name, "Your CubeTrainer password was changed",
        "Your password was changed",
        "The password for your CubeTrainer account was just changed and all other devices were signed out.",
        null, null,
        "If this was not you, reset your password immediately and contact support.");

    public static EmailMessage TwoFactorChanged(string to, string name, bool enabled) => Build(
        to, name, enabled ? "Two-step verification is on for CubeTrainer" : "Two-step verification was turned off",
        enabled ? "Two-step verification is on" : "Two-step verification was turned off",
        enabled
            ? "Signing in to your CubeTrainer account now needs a code from your authenticator app."
            : "Your CubeTrainer account no longer asks for an authenticator code when you sign in.",
        null, null,
        "If this was not you, reset your password immediately and sign in to review your account.");

    private static EmailMessage Build(string to, string name, string subject, string heading, string body, string? button, string? link, string footer)
    {
        var h = WebUtility.HtmlEncode(heading);
        var b = WebUtility.HtmlEncode(body);
        var f = WebUtility.HtmlEncode(footer);
        var cta = button is null || link is null
            ? string.Empty
            : $"<p style=\"margin:28px 0\"><a href=\"{WebUtility.HtmlEncode(link)}\" style=\"background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block\">{WebUtility.HtmlEncode(button)}</a></p>" +
              $"<p style=\"color:#64748b;font-size:13px\">Button not working? Copy this link into your browser:<br><span style=\"word-break:break-all\">{WebUtility.HtmlEncode(link)}</span></p>";
        var html =
            "<!doctype html><html><body style=\"margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a\">" +
            "<table role=\"presentation\" width=\"100%\" style=\"padding:24px 12px\"><tr><td align=\"center\">" +
            "<table role=\"presentation\" width=\"100%\" style=\"max-width:520px;background:#fff;border-radius:12px;padding:32px\"><tr><td>" +
            "<div style=\"font-weight:700;color:#2563eb;letter-spacing:.3px\">CubeTrainer</div>" +
            $"<h1 style=\"font-size:22px;margin:16px 0 8px\">{h}</h1><p style=\"line-height:1.55\">{b}</p>{cta}" +
            $"<p style=\"color:#64748b;font-size:13px;line-height:1.5\">{f}</p>" +
            "</td></tr></table></td></tr></table></body></html>";
        var text = $"{heading}\n\n{body}\n\n{(link is null ? string.Empty : link + "\n\n")}{footer}\n\nCubeTrainer";
        return new EmailMessage(to, name, subject, html, text);
    }
}
