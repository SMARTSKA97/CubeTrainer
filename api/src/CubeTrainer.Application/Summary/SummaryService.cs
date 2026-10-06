using CubeTrainer.Application.Abstractions;

namespace CubeTrainer.Application.Summary;

public sealed class SummaryService(ISolveRepository solves, ICaseStatusRepository statuses, TimeProvider clock)
{
    /// <param name="tzOffsetMinutes">Minutes ahead of UTC for the caller's local day (India = 330).</param>
    public async Task<SummaryResult> GetAsync(int tzOffsetMinutes, CancellationToken ct)
    {
        var offset = Math.Clamp(tzOffsetMinutes, -14 * 60, 14 * 60);
        return SummaryCalculator.Compute(await solves.ListAsync(null, null, ct), await statuses.GetAllAsync(ct), offset, clock.GetUtcNow());
    }
}
