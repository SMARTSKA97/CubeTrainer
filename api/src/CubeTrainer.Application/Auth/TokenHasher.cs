using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;

namespace CubeTrainer.Application.Auth;

/// <summary>Opaque random tokens (refresh tokens, email links). Only their SHA-256 is stored.</summary>
public static class TokenHasher
{
    public static string NewToken() => WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));

    public static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
