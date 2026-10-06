using System.Security.Cryptography;
using System.Text;

namespace CubeTrainer.Application.Auth.TwoFactor;

/// <summary>Backup codes like "K7QF2-M9XWD": 50 random bits each, shown once, stored only as SHA-256.</summary>
public static class RecoveryCodes
{
    public const int Count = 10;
    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L lookalikes

    public static IReadOnlyList<string> Generate() =>
        Enumerable.Range(0, Count).Select(_ => New()).ToList();

    private static string New()
    {
        var chars = new char[10];
        for (var i = 0; i < chars.Length; i++) chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        return $"{new string(chars, 0, 5)}-{new string(chars, 5, 5)}";
    }

    /// <summary>Upper-case, dashes and spaces removed, so "k7qf2 m9xwd" matches "K7QF2-M9XWD". Null if it cannot be a code.</summary>
    public static string? Normalise(string? code)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;
        var clean = new string(code.Where(c => c != '-' && !char.IsWhiteSpace(c)).ToArray()).ToUpperInvariant();
        return clean.Length == 10 && clean.All(c => Alphabet.Contains(c, StringComparison.Ordinal)) ? clean : null;
    }

    public static string Hash(string normalised) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(normalised)));
}
