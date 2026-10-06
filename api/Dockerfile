# Build context: ./api  (docker build -f api/Dockerfile api)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props .editorconfig ./
COPY src/CubeTrainer.Domain/*.csproj src/CubeTrainer.Domain/
COPY src/CubeTrainer.Application/*.csproj src/CubeTrainer.Application/
COPY src/CubeTrainer.Infrastructure/*.csproj src/CubeTrainer.Infrastructure/
COPY src/CubeTrainer.Api/*.csproj src/CubeTrainer.Api/
RUN dotnet restore src/CubeTrainer.Api/CubeTrainer.Api.csproj
COPY src/ src/
RUN dotnet publish src/CubeTrainer.Api/CubeTrainer.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
# Non-root: the aspnet image ships an unprivileged "app" user (uid 1654).
USER 1654
ENV ASPNETCORE_URLS=http://+:8080 \
    DOTNET_EnableDiagnostics=0
EXPOSE 8080
ENTRYPOINT ["dotnet", "CubeTrainer.Api.dll"]
