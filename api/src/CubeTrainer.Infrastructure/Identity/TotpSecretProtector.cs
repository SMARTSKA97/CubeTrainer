using System.Security.Cryptography;
using CubeTrainer.Application.Auth.TwoFactor;
using Microsoft.Extensions.Options;

namespace CubeTrainer.Infrastructure.Identity;

/// <summary>Bound from "Totp". The key must be exactly 32 random bytes, base64 encoded (<c>openssl rand -base64 32</c>).</summary>
public sealed class TotpOptions
{
    public const string Section = "Totp";

    public string EncryptionKey { get; set; } = string.Empty;

    public static bool IsValidKey(string key)
    {
        try
        {
            return Convert.FromBase64String(key).Length == 32;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

/// <summary>
/// AES-256-GCM for authenticator secrets, so a database leak alone does not reveal anybody's second factor.
/// Stored as base64(nonce | tag | ciphertext). The key lives in configuration, not in the database.
/// </summary>
public sealed class AesGcmTotpSecretProtector(IOptions<TotpOptions> options) : ITotpSecretProtector
{
    private static readonly byte[] Aad = "cubetrainer-totp-v1"u8.ToArray();
    private readonly byte[] _key = Convert.FromBase64String(options.Value.EncryptionKey);

    public string Protect(byte[] secret)
    {
        var nonce = RandomNumberGenerator.GetBytes(AesGcm.NonceByteSizes.MaxSize);
        var tag = new byte[AesGcm.TagByteSizes.MaxSize];
        var cipher = new byte[secret.Length];
        using var aes = new AesGcm(_key, tag.Length);
        aes.Encrypt(nonce, secret, cipher, tag, Aad);
        return Convert.ToBase64String([.. nonce, .. tag, .. cipher]);
    }

    public byte[]? Unprotect(string stored)
    {
        try
        {
            var all = Convert.FromBase64String(stored);
            var nonceLen = AesGcm.NonceByteSizes.MaxSize;
            var tagLen = AesGcm.TagByteSizes.MaxSize;
            if (all.Length <= nonceLen + tagLen) return null;
            var plain = new byte[all.Length - nonceLen - tagLen];
            using var aes = new AesGcm(_key, tagLen);
            aes.Decrypt(all.AsSpan(0, nonceLen), all.AsSpan(nonceLen + tagLen), all.AsSpan(nonceLen, tagLen), plain, Aad);
            return plain;
        }
        catch (Exception ex) when (ex is CryptographicException or FormatException)
        {
            return null; // wrong key or damaged value: treated as "no valid secret"
        }
    }
}
