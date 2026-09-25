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
git tag v0.1.13
git push origin v0.1.13
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

## Why Windows warns about the installer, and how to stop it

As of v0.1.15 the Windows installer is **not code-signed**: the SignPath
steps are in the workflow, but the SignPath account and secrets do not exist
yet. (Before 2026-09-23 the step could not have worked anyway: it named an
artifact nobody uploaded, and it signed after the updater signature was made,
which would have broken every in-app update.) An unsigned installer gets the
"Windows protected your PC" SmartScreen prompt, and antivirus heuristics treat
it with more suspicion.

Until 2026-09-23 the site also served an `irm https://…/install.ps1 | iex`
script that purged any existing install, downloaded a zip from several
fallback URLs (one pinned to v0.1.1), unpacked it and ran an unsigned launcher
exe that opened a local web server. Security tools treat that sequence as
malware behaviour, so the script was removed, along with the "portable" build
it delivered. The Tauri installer is
the only Windows download.

To sign, pick one:

| Option | Cost | Who can use it | Notes |
|---|---|---|---|
| **Microsoft Artifact Signing** (formerly Trusted Signing) | paid Azure subscription; see the pricing page | organizations, and individual developers in supported countries, after identity validation (government ID) | Microsoft-issued certificate. SmartScreen reputation still builds with downloads; it is not instant. GitHub Action available. |
| **SignPath Foundation** (chosen) | free | open-source projects, after an application | Wired into the workflow; setup below. |
| A commercial OV certificate | per year | anyone | Now issued on hardware tokens or cloud HSMs; awkward in CI. |

Signing removes "unknown publisher", and a signed file builds SmartScreen
reputation as people download it. Until then, submitting each release to
Microsoft (https://www.microsoft.com/wdsi/filesubmission) speeds it up.

### Setting up SignPath Foundation

1. **Apply** at https://signpath.org/apply with the repository URL. Their
   conditions (https://signpath.org/terms) that this project already meets:
   OSI licence (Apache-2.0), built only from this repository by GitHub
   Actions, published releases, a public
   [code signing policy](https://process-forge.pages.dev/code-signing.html)
   linked from the homepage, and a
   [privacy statement](https://process-forge.pages.dev/privacy.html).
   What they require of you: multi-factor authentication on GitHub and on
   SignPath for everyone listed in the policy's team roles.
2. Once accepted, in SignPath, create (or confirm) these names, which the
   workflow uses:
   - project **`process-forge`**, linked to the GitHub repository (the
     "trusted build system" connector for GitHub Actions);
   - artifact configuration **`installer`**: a zip containing the NSIS
     `*.exe`, signed with Authenticode (Windows ships only the NSIS installer: an MSI installs per machine, separately from it, so neither would find the other);
   - signing policy **`release-signing`**, with yourself as approver.
3. Create a CI user in SignPath and add two repository secrets under
   **Settings → Secrets and variables → Actions**:
   `SIGNPATH_API_TOKEN` (that user's API token) and `SIGNPATH_ORG_ID`.
4. Tag a release as usual. The Windows job uploads the installers, waits
   while you approve the request in SignPath, puts the signed files back,
   re-creates the updater `.sig` for the signed `.exe`, and prints
   `Get-AuthenticodeSignature` for each file. Look for `Valid` there.

Without the secrets, those steps are skipped, except the updater re-signing,
which runs on every release so it is proven before a certificate exists.
