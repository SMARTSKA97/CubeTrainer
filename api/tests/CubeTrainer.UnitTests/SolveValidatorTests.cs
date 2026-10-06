using CubeTrainer.Application.Solves;
using CubeTrainer.Domain.Solves;

namespace CubeTrainer.UnitTests;

public class SolveValidatorTests
{
    [Fact]
    public void A_normal_solve_is_valid() => Assert.Null(SolveValidator.Validate(TestData.Solve(12345)));

    [Fact]
    public void Empty_id_is_rejected()
    {
        var s = TestData.Solve(1000);
        s.Id = Guid.Empty;
        Assert.Contains("id", SolveValidator.Validate(s));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(86_400_001)]
    public void Time_out_of_range_is_rejected(int ms) => Assert.Contains("timeMs", SolveValidator.Validate(TestData.Solve(ms)));

    [Fact]
    public void Case_mode_needs_a_case_id() =>
        Assert.Contains("caseId", SolveValidator.Validate(TestData.Solve(1000, mode: SolveModes.Case)));

    [Fact]
    public void Case_mode_with_case_id_is_valid() =>
        Assert.Null(SolveValidator.Validate(TestData.Solve(1000, mode: SolveModes.Case, caseId: "J1")));

    [Theory]
    [InlineData("x")]
    [InlineData("")]
    public void Unknown_penalty_is_rejected(string penalty) =>
        Assert.Contains("penalty", SolveValidator.Validate(TestData.Solve(1000, penalty)));

    [Fact]
    public void Unknown_stage_is_rejected()
    {
        var s = TestData.Solve(1000);
        s.Stage = "zbll";
        Assert.Contains("stage", SolveValidator.Validate(s));
    }

    [Fact]
    public void Tag_limits_are_enforced()
    {
        Assert.Null(SolveValidator.ValidateTags(["pause", "recog"]));
        Assert.NotNull(SolveValidator.ValidateTags(Enumerable.Repeat("a", 13).ToArray()));
        Assert.NotNull(SolveValidator.ValidateTags([new string('a', 25)]));
        Assert.NotNull(SolveValidator.ValidateTags([" "]));
    }
}
