namespace CubeTrainer.Infrastructure.Email;

public sealed class EmailOptions
{
    public const string Section = "Email";

    /// <summary>"Brevo" sends real mail. "Log" only writes the message (with its links) to the log: development.</summary>
    public string Provider { get; set; } = "Log";

    /// <summary>An address on your own domain with SPF/DKIM set up in Brevo, e.g. no-reply@yourdomain.com.</summary>
    public string FromAddress { get; set; } = "no-reply@localhost";

    public string FromName { get; set; } = "CubeTrainer";

    public string BrevoApiKey { get; set; } = string.Empty;

    public string BrevoBaseUrl { get; set; } = "https://api.brevo.com";
}
