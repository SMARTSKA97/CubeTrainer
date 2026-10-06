using CubeTrainer.Application.Auth;

namespace CubeTrainer.UnitTests;

public class ProfileValidatorTests
{
    [Theory]
    [InlineData("abc", true)]
    [InlineData("Cuber_2000", true)]
    [InlineData("ab", false)]
    [InlineData("1cuber", false)]
    [InlineData("has space", false)]
    [InlineData("waytoolonghandle_over20chars", false)]
    [InlineData("Admin", false)]
    public void Handle_rules(string handle, bool ok) => Assert.Equal(ok, ProfileValidator.Handle(handle) is null);

    [Theory]
    [InlineData("a@b.co", true)]
    [InlineData("a@b", false)]
    [InlineData("a b@c.com", false)]
    [InlineData("", false)]
    public void Email_rules(string email, bool ok) => Assert.Equal(ok, ProfileValidator.Email(email) is null);

    [Fact]
    public void Birth_year_enforces_the_minimum_age()
    {
        Assert.Null(ProfileValidator.BirthYear(2013, 13, 2026));
        Assert.NotNull(ProfileValidator.BirthYear(2014, 13, 2026));
        Assert.NotNull(ProfileValidator.BirthYear(1800, 13, 2026));
        Assert.NotNull(ProfileValidator.BirthYear(null, 13, 2026));
    }

    [Fact]
    public void Country_must_be_an_iso_code()
    {
        Assert.Null(ProfileValidator.Country("IN"));
        Assert.NotNull(ProfileValidator.Country("in"));
        Assert.NotNull(ProfileValidator.Country("ZZ"));
        Assert.NotNull(ProfileValidator.Country(null));
    }
}
