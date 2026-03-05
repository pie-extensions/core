# pie-extensions/core

## What this repo is

This is the **control plane** for the `pie-extensions` GitHub org. It manages all mirrored PHP extension repositories, making them installable via [PIE](https://github.com/php/pie) (the PECL replacement).

The org exists because not all PHP extensions have native PIE support yet. We mirror their releases and wrap them in PIE-compatible packaging so users can install them today.

## Repo responsibilities

- `registry.json` — source of truth listing all mirrored extensions
- GitHub Actions workflows that detect upstream releases and dispatch syncs to mirror repos
- Onboarding workflow to create new mirror repos from the template
- Health check workflow to detect stale or broken mirrors
- Scripts used by the workflows (Node.js, ES modules, requires Node >=20)

## What this repo does NOT do

- It does not contain extension source code (that lives in individual mirror repos)
- It does not build binaries (that's handled by `pie-extensions/mirror-action`)
- It does not publish to Packagist (that's manual per extension, documented below)

## Key files

```
registry.json                        # all extensions, their upstream, status
registry.schema.json                 # JSON Schema for registry.json validation
.github/workflows/
  check-upstreams.yml                # daily: detect new upstream releases + dispatch syncs
  sync-new-mirrors.yml               # on registry.json push: sync newly added mirrors
  onboard-extension.yml              # create new mirror repo from template
  health-check.yml                   # weekly: detect broken mirrors, open issues
scripts/
  check-upstreams.js                 # compares upstream tags vs mirror tags
  check-new-mirrors.js               # finds mirrors with no tags (never synced)
  dispatch-syncs.js                  # fires workflow_dispatch on mirror repos
  create-mirror-repo.js              # GitHub API: repo creation from template
  health-check.js                    # validates each mirror repo's state
  add-to-registry.js                 # adds extension entry to registry.json
  utils/
    github.js                        # shared GitHub API client (octokit)
    registry.js                      # read/write registry.json helpers
    actions.js                       # GitHub Actions output helpers (setOutput)
```

## registry.json schema

```json
{
  "extensions": [
    {
      "name": "redis",
      "mirror-repo": "pie-extensions/redis",
      "upstream-repo": "phpredis/phpredis",
      "upstream-type": "github",
      "packagist-name": "pie-extensions/redis",
      "packagist-registered": false,
      "php-ext-name": "redis",
      "status": "active",
      "added": "YYYY-MM-DD",
      "notes": ""
    }
  ]
}
```

`status` values: `active` | `stale` | `deprecated` | `needs-packagist`

## How syncing works

1. `check-upstreams.yml` runs daily via cron (05:00 UTC)
2. The `check` job runs `check-upstreams.js` — for each active extension in `registry.json`, it compares the latest upstream GitHub release tag against the latest tag in the mirror repo
3. Extensions with a newer upstream version are collected into a JSON list (output as `stale`)
4. If stale count > 0 and not a dry run, the `dispatch` job runs `dispatch-syncs.js` which fires `workflow_dispatch` on each stale mirror repo's `sync.yml` workflow
5. The mirror repo's workflow calls `pie-extensions/mirror-action` to do the actual sync, release, and optional binary build

## Adding a new extension

Run the onboarding workflow manually:

```
GitHub UI → Actions → Onboard Extension → Run workflow
  upstream-repo: phpredis/phpredis
  ext-name: redis
  php-ext-name: redis
```

This will:
1. Create `pie-extensions/redis` from the `extension-template` repo
2. Populate `.pie-mirror.json` with upstream config
3. Update `composer.json` with extension metadata
4. Add the extension to `registry.json` via `add-to-registry.js`
5. Open a PR for the registry update

When the PR is merged, `sync-new-mirrors.yml` detects that the new mirror has no tags and automatically dispatches the initial sync.

After merging the PR you must **manually register on Packagist** — this cannot be automated.

## Packagist registration (manual step)

1. Go to https://packagist.org/packages/submit
2. Enter the mirror repo URL: `https://github.com/pie-extensions/<name>`
3. Set up the GitHub webhook for auto-updates
4. Set `packagist-registered: true` in `registry.json`

## Local development

```bash
npm install
node scripts/check-upstreams.js --dry-run    # see what would be synced
node scripts/health-check.js                 # check all mirror repo states
```

Requires Node >=20 and `GITHUB_TOKEN` env var with `repo` and `workflow` scopes.

## Secrets required

| Secret                 | Used by                    | Purpose                               |
|------------------------|----------------------------|---------------------------------------|
| `GITHUB_TOKEN`         | all workflows              | default, auto-provided                |
| `PIE_COMPAT_BOT_TOKEN` | dispatch-syncs, onboarding | needs `workflow` scope on other repos |

The default `GITHUB_TOKEN` cannot trigger workflows in other repos — `PIE_COMPAT_BOT_TOKEN` must be a PAT or GitHub App token with `workflow` scope set as an org secret.

### `PIE_COMPAT_BOT_TOKEN` fine-grained token permissions

The token needs access to **all repositories** in the `pie-extensions` org (it creates new repos, pushes to mirrors, and dispatches workflows on any mirror).

| Repository permission | Access       | Reason                                                                 |
|-----------------------|--------------|------------------------------------------------------------------------|
| **Administration**    | Read & Write | `repos.createUsingTemplate` — create new mirror repos from template    |
| **Contents**          | Read & Write | `repos.createOrUpdateFileContents` — write `.pie-mirror.json` and `composer.json` in mirror repos |
| **Actions**           | Read & Write | `actions.createWorkflowDispatch` — trigger `sync.yml` on mirror repos  |
| **Pull requests**     | Read & Write | `peter-evans/create-pull-request` — open PRs on the core repo          |
| **Metadata**          | Read         | Required by all fine-grained tokens (auto-granted)                     |

> **Note:** `repos.createUsingTemplate` requires Administration write access. If GitHub's fine-grained token support doesn't cover this, use a classic PAT with `repo` + `workflow` scopes instead.

## Architecture diagram

```
core (this repo)
  ├── check-upstreams.yml (daily cron)
  │     ├── check job
  │     │     └── reads registry.json
  │     │     └── GitHub API: get latest tag per upstream
  │     │     └── GitHub API: get latest tag per mirror
  │     │     └── outputs: JSON list of stale extension names
  │     └── dispatch job (if stale count > 0)
  │           └── dispatch-syncs.js
  │           └── workflow_dispatch → pie-extensions/redis/sync.yml
  │           └── workflow_dispatch → pie-extensions/imagick/sync.yml
  │           └── ...
  │
  └── sync-new-mirrors.yml (on registry.json push to main)
        ├── check job
        │     └── reads registry.json
        │     └── GitHub API: get latest tag per mirror
        │     └── outputs: JSON list of mirrors with no tags
        └── dispatch job (if count > 0)
              └── dispatch-syncs.js
              └── workflow_dispatch → newly added mirror repos

each mirror repo (on dispatch)
  └── sync.yml
        └── pie-extensions/mirror-action@v1 (sync)
        └── pie-extensions/mirror-action@v1 (release)
        └── pie-extensions/mirror-action@v1 (build-binaries → delegates to php/pie-ext-binary-builder)
```

## Build matrix: version-specific PHP constraints

Some extensions need different PHP version matrices depending on the extension version. For example, gRPC `<10.0` supports PHP 8.2–8.4, while `>=10.0` adds PHP 8.5 support.

The `.pie-mirror.json` build config supports an optional `php-version-constraints` array:

```json
{
  "build": {
    "enabled": true,
    "php-versions": ["8.2", "8.3", "8.4"],
    "php-version-constraints": [
      { "ext-versions": "<10.0.0", "php-versions": ["8.2", "8.3", "8.4"] },
      { "ext-versions": ">=10.0.0", "php-versions": ["8.2", "8.3", "8.4", "8.5"] }
    ]
  }
}
```

**Resolution logic:** When building a release, `resolvePhpVersions(extVersion, buildConfig)` iterates `php-version-constraints` in order and returns the `php-versions` from the first entry whose `ext-versions` range matches (via `semver.satisfies`). If no constraint matches (or the array is empty/absent), the default `build.php-versions` is used.

**Semver range operators:** Any valid semver range syntax works — `>=10.0.0`, `<9.0.0`, `>=8.0.0 <9.0.0`, `^2.0.0`, `~1.5.0`, etc. Extension version tags are coerced via `semver.coerce` (handles `v` prefixes and missing patch versions).

The `resolve-matrix` mode in `mirror-action` uses this logic to produce the build matrix consumed by the `build-binaries.yml` workflow.

## Related repos

- [`pie-extensions/mirror-action`](https://github.com/pie-extensions/mirror-action) — composite action handling sync/release (Node.js) and build (delegates to `php/pie-ext-binary-builder`)
- [`pie-extensions/extension-template`](https://github.com/pie-extensions/extension-template) — template used when creating new mirror repos
- [PIE upstream](https://github.com/php/pie) — the tool users run to install extensions