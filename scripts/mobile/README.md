# MetaEdit Mobile Debug Harness

This directory contains a USB iPhone harness for testing the local MetaEdit build
inside Obsidian iOS. It is adapted from `/Users/christian/Developer/safdeb` and
uses:

- `pymobiledevice3` House Arrest AFC to copy plugin files into Obsidian's app
  documents container.
- `pymobiledevice3` Web Inspector to evaluate JavaScript in Obsidian's WKWebView,
  reload the plugin, and stream console errors.

## Prerequisites

- iPhone connected over USB, unlocked, trusted by this Mac.
- Obsidian open on the phone.
- iOS setting enabled: Settings > Apps > Safari > Advanced > Web Inspector.
- Local build artifacts created first:

```bash
pnpm run build
```

Run commands through `uv` so the Python dependency is isolated:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py diagnose
```

## Safety

The phone vault is real. Use a clearly named scratch vault when possible and
pass it explicitly:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py diagnose --vault MetaEditMobileScratch
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py deploy --vault MetaEditMobileScratch --confirm-real-vault
```

Christian's primary phone vault has historically been an AFC-reachable local
vault named `notes`. If `--vault` is omitted, deploy targets:

```text
/Documents/notes/.obsidian/plugins/metaedit
```

Do not deploy to `notes` unless Christian explicitly approves that target for
the current session. `deploy` refuses to run unless `--confirm-real-vault` is
passed. Before writing, it snapshots the existing phone plugin folder into:

```text
~/.metaedit-mobile-backups/metaedit/<device>/<vault>/<timestamp>/
```

List or restore backups with:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py backups
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py restore
```

Deploy also checks that the vault open in Obsidian's WebView has the same name as
the AFC target vault before writing. The harness is not an iCloud-container
deployer; if a vault is not visible under Obsidian's app Documents container, it
will stop before deploy.

## Commands

Diagnose install/runtime state:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py diagnose
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py diagnose --vault MetaEditMobileScratch
```

Deploy the local build after explicit approval:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py deploy --confirm-real-vault
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py deploy --vault MetaEditMobileScratch --confirm-real-vault
```

Reload the already-installed plugin:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py reload
```

Evaluate JavaScript in Obsidian iOS:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py eval 'app.vault.getName()'
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py eval --file scripts/mobile/probes/issue99_frontmatter.js
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py eval --file scripts/mobile/probes/core_smoke.js
```

Stream console errors while reproducing manually:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py logs --seconds 120
```

## Issue #99 Probe

`scripts/mobile/probes/issue99_frontmatter.js` creates this scratch note:

```text
MetaEdit Mobile Debug/issue-99-frontmatter.md
```

It verifies the frontmatter path that #99 reported, then removes the scratch note
and any empty scratch folder after collecting the returned evidence:

- blank YAML values read as `null`, not the literal string `"null"`;
- MetaEdit can create a YAML key through the public API;
- MetaEdit can update an existing YAML key through the public API;
- setting a YAML value to `null` reads back as `null`;
- no visible `position` property appears in MetaEdit's parsed properties or raw
  note text.

Obsidian's raw frontmatter cache keys are returned only as diagnostics because
older mobile APIs may keep an internal cache key named `position`.

## Core Smoke Probe

`scripts/mobile/probes/core_smoke.js` creates scratch files under a unique
per-run folder:

```text
MetaEdit Mobile Debug/core-smoke-<timestamp>/
```

It checks:

- the Edit Meta command opens and lists YAML and inline fields;
- an inline `key:: value` field updates through the public API;
- the Auto Properties value prompt opens and writes a selected value;
- Progress Properties update YAML without rewriting matching body text;
- the Kanban helper updates a linked note when a card moves lanes.

The smoke probe keeps settings changes in memory and removes the scratch files
and empty scratch folders it created after collecting evidence. It uses unique
per-run paths and a unique Kanban board name so repeated runs do not collide with
the automator's path-content cache or existing board names. If Web Inspector
disconnects mid-run, rerun `restore`/`reload` before continuing.

## Android

The Android harness uses `adb` plus WebView CDP forwarding. It expects Obsidian
to be running and a disposable scratch vault to be open. Android deploy does not
snapshot or restore plugin files, so it refuses to deploy unless
`--confirm-scratch-vault` is passed.

Optional emulator setup:

```bash
brew install android-platform-tools android-commandlinetools
yes | ANDROID_HOME=/opt/homebrew/share/android-commandlinetools sdkmanager --licenses
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools sdkmanager \
  "emulator" \
  "platform-tools" \
  "platforms;android-35" \
  "system-images;android-35;google_apis;arm64-v8a"
printf 'no\n' | ANDROID_HOME=/opt/homebrew/share/android-commandlinetools avdmanager create avd \
  --force \
  --name MetaEditMobileApi35 \
  --package "system-images;android-35;google_apis;arm64-v8a" \
  --device pixel_7
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
  /opt/homebrew/share/android-commandlinetools/emulator/emulator \
  -avd MetaEditMobileApi35 \
  -no-snapshot \
  -no-window \
  -gpu swiftshader_indirect \
  -no-audio \
  -no-boot-anim
```

Install Obsidian's official Android APK, create/open a scratch vault at
`/sdcard/Documents/MetaEditMobile`, then run:

```bash
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py diagnose
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py deploy --confirm-scratch-vault
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py eval --file scripts/mobile/probes/issue99_frontmatter.js
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py eval --file scripts/mobile/probes/core_smoke.js
```
