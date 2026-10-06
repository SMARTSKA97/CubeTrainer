using CubeTrainer.Domain.Users;

namespace CubeTrainer.Application.Auth;

public sealed record RegisterRequest(
    string? Email,
    string? Password,
    string? DisplayName,
    string? Handle,
    string? Country,
    int? BirthYear,
    string? CubeMethod,
    string? CubeModel,
    int? CubingYears,
    bool AcceptTerms);

public sealed record ProfileUpdate(
    string? DisplayName,
    string? Country,
    string? CubeMethod,
    string? CubeModel,
    int? CubingYears,
    bool? LeaderboardOptIn,
    bool ClearCubeMethod = false,
    bool ClearCubeModel = false,
    bool ClearCubingYears = false);

public sealed record UserProfile(
    Guid Id,
    string Email,
    bool EmailConfirmed,
    string Handle,
    string DisplayName,
    string Country,
    int BirthYear,
    string? CubeMethod,
    string? CubeModel,
    int? CubingSinceYear,
    bool LeaderboardOptIn,
    bool TwoFactorEnabled,
    DateTimeOffset CreatedAt)
{
    public static UserProfile From(AppUser u) => new(
        u.Id, u.Email, u.EmailConfirmed, u.Handle, u.DisplayName, u.Country, u.BirthYear,
        u.CubeMethod, u.CubeModel, u.CubingSinceYear, u.LeaderboardOptIn, u.TwoFactorEnabled, u.CreatedAt);
}

/// <summary>What a successful sign-in or refresh yields. The refresh token is plain text here and only here.</summary>
public sealed record AuthSession(
    AccessToken Access,
    string RefreshToken,
    DateTimeOffset RefreshExpiresAt,
    Guid SessionId,
    UserProfile User);

public sealed record SessionInfo(Guid SessionId, DateTimeOffset SignedInAt, DateTimeOffset LastActiveAt, string? UserAgent, string? Ip, bool IsCurrent);
