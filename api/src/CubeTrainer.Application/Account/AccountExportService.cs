using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Auth;
using CubeTrainer.Application.Common;

namespace CubeTrainer.Application.Account;

public sealed record ExportedSolve(
    Guid Id, long At, int TimeMs, string Penalty, string Scramble, string Mode, string? SetId, string? CaseId, int? Auf,
    int? InspectionMs, string? Stage, string? Cube, string? Method, string[]? Tags);

public sealed record ExportedLink(string Provider, string? Email, DateTimeOffset LinkedAt);

/// <summary>Everything we hold about one person, in a portable shape. Never includes password hashes, tokens or authenticator secrets.</summary>
public sealed record AccountExport(
    DateTimeOffset ExportedAt,
    UserProfile Profile,
    IReadOnlyList<ExportedSolve> Solves,
    IReadOnlyDictionary<string, string> CaseStatus,
    IReadOnlyList<ExportedLink> LinkedAccounts);

/// <summary>"Download my data": the person's right to a copy (DPDP Act / GDPR).</summary>
public sealed class AccountExportService(
    IUserRepository users,
    ISolveRepository solves,
    ICaseStatusRepository statuses,
    IExternalLoginRepository links,
    TimeProvider clock)
{
    public async Task<Result<AccountExport>> ExportAsync(Guid userId, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(userId, ct);
        if (user is null) return Result<AccountExport>.Fail(ErrorKind.NotFound, "user_not_found", "Account not found.");

        var list = await solves.ListAsync(userId, null, null, ct);
        var logins = await links.ListForUserAsync(userId, ct);
        return Result<AccountExport>.Ok(new AccountExport(
            clock.GetUtcNow(),
            UserProfile.From(user),
            [.. list.Select(s => new ExportedSolve(s.Id, s.AtMs, s.TimeMs, s.Penalty, s.Scramble, s.Mode, s.SetId, s.CaseId, s.Auf, s.InspectionMs, s.Stage, s.Cube, s.Method, s.Tags))],
            await statuses.GetAllAsync(userId, ct),
            [.. logins.Select(l => new ExportedLink(l.Provider, l.Email, l.CreatedAt))]));
    }
}
