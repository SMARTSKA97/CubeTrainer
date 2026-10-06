using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;

namespace CubeTrainer.Application.Auth.TwoFactor;

/// <summary>
/// Time-based one-time passwords, RFC 6238 (HMAC-SHA1, 6 digits, 30 s): what Google Authenticator, Microsoft Authenticator,
/// Authy, 1Password and the rest all speak. Pure functions so they can be tested against the RFC's published vectors.
/// </summary>
public static class Totp
{
    public const int StepSeconds = 30;
    public const int Digits = 6;
    private const string Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    public static byte[] NewSecret() => RandomNumberGenerator.GetBytes(20); // 160 bits, the size RFC 4226 recommends

    public static string Code(byte[] secret, long step)
    {
        Span<byte> counter = stackalloc byte[8];
        BinaryPrimitives.WriteInt64BigEndian(counter, step);
        var hash = HMACSHA1.HashData(secret, counter);
        var offset = hash[^1] & 0x0F;
        var binary = BinaryPrimitives.ReadInt32BigEndian(hash.AsSpan(offset, 4)) & 0x7FFFFFFF;
        return (binary % 1_000_000).ToString("D6", System.Globalization.CultureInfo.InvariantCulture);
    }

    public static long StepAt(DateTimeOffset time) => time.ToUnixTimeSeconds() / StepSeconds;

    /// <summary>
    /// Returns the time step the code belongs to, or null when it is wrong or already used. One step either side is accepted
    /// for clock drift. Steps at or before <paramref name="lastUsedStep"/> are refused, so a code works once.
    /// </summary>
    public static long? Match(byte[] secret, string? code, DateTimeOffset now, long? lastUsedStep, int window = 1)
    {
        var typed = Normalise(code);
        if (typed is null) return null;
        var typedBytes = Encoding.ASCII.GetBytes(typed);
        long? found = null;
        var current = StepAt(now);
        for (var step = current - window; step <= current + window; step++)
        {
            var same = CryptographicOperations.FixedTimeEquals(typedBytes, Encoding.ASCII.GetBytes(Code(secret, step)));
            if (same && step > (lastUsedStep ?? -1)) found = step; // keep looping: timing must not reveal which step matched
        }

        return found;
    }

    /// <summary>"123 456" and "123456" are both fine; anything that is not six digits is not a TOTP code.</summary>
    public static string? Normalise(string? code)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;
        var digits = new string(code.Where(c => !char.IsWhiteSpace(c) && c != '-').ToArray());
        return digits.Length == Digits && digits.All(char.IsAsciiDigit) ? digits : null;
    }

    public static string ToBase32(byte[] data)
    {
        var sb = new StringBuilder((data.Length * 8 + 4) / 5);
        int buffer = 0, bits = 0;
        foreach (var b in data)
        {
            buffer = (buffer << 8) | b;
            bits += 8;
            while (bits >= 5)
            {
                sb.Append(Alphabet[(buffer >> (bits - 5)) & 31]);
                bits -= 5;
            }
        }

        if (bits > 0) sb.Append(Alphabet[(buffer << (5 - bits)) & 31]);
        return sb.ToString();
    }

    public static byte[]? FromBase32(string text)
    {
        var clean = text.Trim().TrimEnd('=').Replace(" ", string.Empty, StringComparison.Ordinal).ToUpperInvariant();
        var bytes = new List<byte>(clean.Length * 5 / 8);
        int buffer = 0, bits = 0;
        foreach (var c in clean)
        {
            var v = Alphabet.IndexOf(c, StringComparison.Ordinal);
            if (v < 0) return null;
            buffer = (buffer << 5) | v;
            bits += 5;
            if (bits >= 8)
            {
                bytes.Add((byte)((buffer >> (bits - 8)) & 0xFF));
                bits -= 8;
            }
        }

        return [.. bytes];
    }

    /// <summary>The otpauth:// link a QR code carries; authenticator apps read it to add the account.</summary>
    public static string OtpAuthUri(string issuer, string account, string secretBase32) =>
        $"otpauth://totp/{Uri.EscapeDataString(issuer)}:{Uri.EscapeDataString(account)}?secret={secretBase32}&issuer={Uri.EscapeDataString(issuer)}&algorithm=SHA1&digits={Digits}&period={StepSeconds}";
}
