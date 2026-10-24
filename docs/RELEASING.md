# Releasing

The package publishes as **`@nemesis-oss/dhanhq-sdk`**.

> This is a community SDK. Dhan publishes its own official clients as
> [`dhanhq`](https://www.npmjs.com/package/dhanhq) and
> [`dhanhq-ts`](https://www.npmjs.com/package/dhanhq-ts). Do not publish this
> package under the `@dhanhq` scope or any name implying vendor authorship.

## One-time setup

1. Create an npm **automation** access token on an account that can publish to
   the `@shubhamtaywade82` scope.
2. Add it to the repository as the `NPM_TOKEN` secret
   (*Settings → Secrets and variables → Actions*).

Nothing else is needed — the scope is a personal one, so no npm organization
has to exist.

## Cutting a release

Releases are automated with
[release-please](https://github.com/googleapis/release-please)
(`.github/workflows/release-please.yml`).

1. Merge PRs with [Conventional Commit](https://www.conventionalcommits.org/)
   titles. The repo squash-merges with the PR title as the commit subject, and
   `.github/workflows/pr-title.yml` rejects any other title format.
   - `fix:` → patch, `feat:` → minor, `feat!:` or a `BREAKING CHANGE:` footer → major
   - `chore:`/`docs:`/`test:`/`ci:`/`refactor:` → no release
   - a `Release-As: x.y.z` footer overrides the computed version
2. release-please keeps one `chore: release x.y.z` PR open that bumps
   `package.json` and `package-lock.json`.
3. On that PR's branch, update `CHANGELOG.md`: move items out of `Unreleased`
   into the new version heading, and update the link definitions at the bottom.
   release-please does not write the changelog (`skip-changelog`).
4. Merge the release PR — **this publishes to npm**. release-please tags
   `vX.Y.Z`, creates the GitHub Release, and calls `publish.yml`, which
   typechecks, tests and builds before `npm publish`. (A tag or release created
   with the workflow token cannot trigger `publish.yml` by itself, so the
   release-please workflow calls it directly.)

### Manual release (fallback)

`publish.yml` still runs on a pushed `v*` tag and on a GitHub Release
published from the browser. If you release by hand, bump
`.release-please-manifest.json` to the same version so release-please does
not propose it again.

`workflow_dispatch` on the same workflow can publish manually, including under
a non-`latest` dist-tag for prereleases.

## Upstream drift

`.github/workflows/upstream-watch.yml` runs every Monday 09:00 IST and diffs
`openapi.json` against the spec Dhan serves live
(`https://api.dhan.co/v2/v3/api-docs`); `npm run upstream:drift` runs the same
check locally. On drift it re-pins, regenerates `src/generated`, runs the
gates, and opens a PR on `upstream-sync/auto` titled `feat(api)` (operations
added or removed) or `fix(api)` (fields changed). It also opens or updates one
`upstream-drift` issue.

`contracts/known-gaps.json` records every difference between the pinned spec
and the SDK's resource classes, with a reason; `spec/known_gaps.spec.ts`
fails on an unrecorded difference or a stale entry.
`contracts/openapi-pin.json` records the pin's source, date and sha256.

## Publishing from a laptop

Possible, but `package.json` sets `publishConfig.provenance: true`, which
requires a CI environment with an OIDC token. A local publish must opt out:

```bash
npm publish --no-provenance
```

Prefer the workflow — provenance is what lets consumers verify the tarball was
built from this repository at that commit.

## Pre-flight checks

CI runs these on every push, but they are worth running before tagging:

```bash
npm run typecheck
npm test
npm run build

# Declaration resolution across node10 / node16 / bundler
npx @arethetypeswrong/cli --pack .

# Exactly what lands in the tarball
npm pack --dry-run
```

## Versioning

Semantic versioning. Note in particular:

- Renaming or removing a public method is a **major** bump. Method signatures
  are the contract for anything depending on this SDK.
- Tightening a risk-pipeline default, narrowing a policy scope, or changing
  what the live-trading gate permits is at minimum a **minor** bump and needs a
  `CHANGELOG.md` entry under **Changed**, since it can stop a caller's orders
  from going out.
- Adding a tool, skill or indicator is a **minor** bump.
