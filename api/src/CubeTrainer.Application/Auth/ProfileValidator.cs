using System.Net.Mail;
using System.Text.RegularExpressions;
using CubeTrainer.Domain.Users;

namespace CubeTrainer.Application.Auth;

/// <summary>Field rules shared by registration and profile edits. Returns an error message, or null when fine.</summary>
public static partial class ProfileValidator
{
    private static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
    {
        "admin", "administrator", "root", "support", "help", "staff", "moderator", "mod", "system", "official",
        "cubetrainer", "cube", "wca", "api", "www", "null", "undefined", "me", "you", "anonymous", "guest", "lifeos",
    };

    [GeneratedRegex("^[A-Za-z][A-Za-z0-9_]{2,19}$")]
    private static partial Regex HandlePattern();

    public static string? Email(string? email)
    {
        if (string.IsNullOrWhiteSpace(email) || email.Length > 254) return "Enter a valid email address.";
        if (!MailAddress.TryCreate(email, out var addr) || !string.Equals(addr.Address, email, StringComparison.Ordinal) || !addr.Host.Contains('.', StringComparison.Ordinal))
        {
            return "Enter a valid email address.";
        }

        return null;
    }

    public static string? Handle(string? handle)
    {
        if (handle is null || !HandlePattern().IsMatch(handle)) return "Username must be 3-20 characters: letters, numbers or underscore, starting with a letter.";
        return Reserved.Contains(handle) ? "That username is reserved." : null;
    }

    public static string? DisplayName(string? name)
    {
        if (name is null || name.Trim().Length is < 1 or > 40) return "Display name must be 1-40 characters.";
        return name.Any(char.IsControl) ? "Display name contains invalid characters." : null;
    }

    public static string? Country(string? code) =>
        code is not null && Countries.IsValid(code) ? null : "Choose a country.";

    public static string? BirthYear(int? year, int minimumAge, int currentYear)
    {
        if (year is null || year < currentYear - 110 || year > currentYear) return "Enter a valid birth year.";
        return currentYear - year < minimumAge ? $"You must be at least {minimumAge} to create an account. You can keep using CubeTrainer as a guest." : null;
    }

    public static string? CubeMethod(string? method) => Domain.Users.CubeMethods.IsValid(method) ? null : "Unknown solving method.";

    public static string? CubeModel(string? model) => model is null || model.Length <= 60 && !model.Any(char.IsControl) ? null : "Cube model is too long.";

    public static string? CubingYears(int? years) => years is null or (>= 0 and <= 80) ? null : "Years of cubing must be between 0 and 80.";
}
