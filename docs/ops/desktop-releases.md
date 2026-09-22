# Desktop releases and in-app updates

## Why a release is not optional

The desktop shell loads a **bundled** copy of `apps/web` — `tauri.conf.json` sets
`frontendDist` to `../../web/dist`, and that build is baked into the installer.

So a fix merged to `main` reaches the web studio the moment Pages deploys, and
reaches desktop users **only when a new version is tagged**. Between 2026-09-16
and 2026-09-22 that gap swallowed the desktop-first routing fix, the corrected
landing copy, the unit-op creator, the seeded RNG and the credential fix: all of
them live on the web, none of them in any installer.

If a change matters to desktop users, it needs a tag.

## Cutting a release

```
# from an up-to-date main
git tag v0.1.5
git push origin v0.1.5
```

`release-desktop.yml` builds Windows, macOS and Linux, publishes the installers,
and then assembles `latest.json` so installed clients can discover the release.

## The updater, and why it never worked

`tauri.conf.json` points the updater at:

    https://github.com/omeaga1/process-forge/releases/latest/download/latest.json

That URL returned **404 for every release from v0.1.0 to v0.1.4**. Three
independent things were missing, and any one of them alone is enough to break it:

1. `bundle.createUpdaterArtifacts` was not set, so `tauri build` never produced
   the `.sig` signature files an update manifest is built from.
2. `TAURI_SIGNING_PRIVATE_KEY` was named in a comment in the release workflow
   but never passed to the build step, and was never added as a repository
   secret.
3. Nothing generated or uploaded `latest.json`.

All three are fixed. The build now **fails loudly** if no `.sig` files are
produced, rather than publishing a release that installed clients cannot
discover — a silent success there is exactly how this went unnoticed for five
releases.

## Required secret: TAURI_SIGNING_PRIVATE_KEY

Updates are signed. The public half is already in `tauri.conf.json`; the private
half has to exist as a repository secret or the release build will fail its
verification step.

Generate a keypair. `--ci` skips the passphrase prompt, which is the
recommended setup here:

```
npx.cmd @tauri-apps/cli signer generate -w $env:USERPROFILE\.tauri\process-forge.key --ci
```

A passphrase only protects the key file on a developer's disk. The key's real
protection is that it exists solely as a repository secret. A passphrase that
does not exactly match what is stored in `TAURI_KEY_PASSWORD` fails every
release build at the signing step -- which is precisely what happened on the
first v0.1.5 attempt:

    Finished 2 bundles at: ProcessForge_0.1.5_x64-setup.exe, ...
    failed to decode secret key: incorrect updater private key password

Note that the installers built fine and only signing failed. Before the
verification step added here, that release would have published happily and
been undiscoverable to every installed client.

Then add to **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | contents of the generated private key file |
| `TAURI_KEY_PASSWORD` | only if the key has a passphrase. With a `--ci` key, leave this secret **absent** -- it resolves to an empty string, which is the correct password. |

Finally, replace `plugins.updater.pubkey` in
`apps/desktop/src-tauri/tauri.conf.json` with the public key it prints.

### If you rotate the key

An installed client verifies updates against the public key **compiled into it**.
Changing the key means anyone running an older build cannot verify new updates
and must reinstall once by hand. That is acceptable here precisely because the
updater has never worked — nobody is relying on it yet — but it stops being
acceptable the moment it does.

## Verifying a release actually works

```
# the manifest the app polls must exist
curl -sIL https://github.com/omeaga1/process-forge/releases/latest/download/latest.json | head -1

# and name the platforms
curl -sL https://github.com/omeaga1/process-forge/releases/latest/download/latest.json | jq '.version, (.platforms | keys)'
```

A release whose `latest.json` is missing or has no platforms is invisible to
every installed client, no matter how good the installers are.
