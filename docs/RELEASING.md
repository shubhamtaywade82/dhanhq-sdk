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

1. Update `CHANGELOG.md`: move items out of `Unreleased` into a new version
   heading, and update the link definitions at the bottom.
2. Bump the version — this commits and tags in one step:

   ```bash
   npm version minor   # or patch / major
   ```

3. Push the commit and its tag — **this publishes to npm**:

   ```bash
   git push --follow-tags
   ```

   `.github/workflows/publish.yml` runs on a pushed `v*` tag *and* on a
   published GitHub Release; it typechecks, tests and builds before
   `npm publish`.

4. Add a GitHub Release for the tag with the CHANGELOG section as notes. Its
   own publish run then fails with "cannot publish over the previously
   published version" — expected, the package is already out.

### When the version was bumped in a pull request

If `package.json`, `package-lock.json` and the `CHANGELOG.md` heading were
already moved to the new version in a PR, do **not** run `npm version` (it would
bump again). Tag the PR's merge commit on `main` — a lightweight `vX.Y.Z` tag,
as for `v1.0.0`–`v1.2.0` — which publishes:

```bash
git fetch origin
git tag v1.3.0 <merge-commit-sha>
git push origin v1.3.0
```

From the browser instead: *Releases → Draft a new release*, type the new tag
`v1.3.0`, set **Target** to the merge commit (or a branch pointing at it — not
`main` if `main` has moved on), paste the CHANGELOG section and publish. That
creates the tag and publishes in one step.

`workflow_dispatch` on the same workflow can publish manually, including under
a non-`latest` dist-tag for prereleases.

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
