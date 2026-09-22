# Cloudflare Pages deployment

The `process-forge` Pages project serves `apps/web` at
https://process-forge.pages.dev/ and is connected to this repository, so a push
to `main` publishes.

## How deployment works

The build runs in **GitHub Actions** (`.github/workflows/deploy-pages.yml`), not
in Cloudflare's build container. Cloudflare receives a finished directory and
builds nothing.

This is deliberate. Cloudflare's Git-connected build failed on every commit it
attempted, and wrangler exposes neither the build configuration nor the build
log, so the cause was not diagnosable from outside the dashboard. Moving the
build into CI removes the opaque environment entirely: the deploy now uses the
exact Node version, package manager and build ordering that the test workflow
already runs green on every push, so a passing CI run and a good deploy cannot
disagree.

### One-time setup

Two repository secrets are required (Settings -> Secrets and variables ->
Actions):

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token with the **Cloudflare Pages: Edit** permission. Create it at https://dash.cloudflare.com/profile/api-tokens using the "Edit Cloudflare Workers" template, or a custom token scoped to Account -> Cloudflare Pages -> Edit. |
| `CLOUDFLARE_ACCOUNT_ID` | The account id, shown by `npx.cmd wrangler whoami`. |

### Disconnect the Git integration

While the Pages project stays connected to GitHub it will keep running its own
build in parallel, keep failing, and keep reporting a red check on every pull
request. Disconnect it: Workers & Pages -> process-forge -> Settings -> Builds &
deployments -> **Disconnect**. Deployments then come only from the workflow.

## Legacy: Cloudflare-side build settings

Kept for reference in case the Git integration is ever reconnected. They are
NOT used while deployment runs through GitHub Actions.

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `pnpm build` |
| Build output directory | `apps/web/dist` |
| Root directory | *(repository root — leave empty)* |

## Why the build command is `pnpm build` and not a filter

`apps/web` depends on four workspace packages through `workspace:*`:

- `@process-forge/protocol`
- `@process-forge/simulation-core`
- `@process-forge/canvas-ui`
- `@process-forge/theme`

Vite resolves those through path aliases to each package's `src/`, but `tsc`
still typechecks against their built `dist/` output. A build command scoped to
the web app alone (`pnpm --filter @process-forge/web build`) does not build those
dependencies first, so it can fail in a clean container even though it succeeds
locally where `dist/` already exists from an earlier run.

`pnpm build` runs `turbo run build`, which builds the dependency graph in
topological order. That is the command that works from a cold checkout.

## Node version

`.node-version` at the repository root pins Node 22. Cloudflare Pages reads it.
Without it the build container picks its own default, which has historically
lagged behind what Vite 6 and React 19 require.

## Verifying a deployment

```
npx.cmd wrangler pages deployment list --project-name process-forge
```

A green deploy shows a relative timestamp in the Status column; a broken one
shows `Failure` and links to the build log.

To confirm what is actually live (the HTML is an SPA shell, so grepping it
proves nothing — the copy is in the JS bundle):

```
html=$(curl -s -L https://process-forge.pages.dev/)
asset=$(echo "$html" | grep -oE '(\./)?assets/[A-Za-z0-9._-]+\.js' | head -1 | sed 's|^\./||')
curl -s "https://process-forge.pages.dev/$asset" | grep -c "Discrete-Event Simulation"
```

## Manual deploy

Still available if the pipeline is broken:

```
pnpm --filter @process-forge/web build
npx.cmd wrangler pages deploy apps/web/dist --project-name process-forge
```
