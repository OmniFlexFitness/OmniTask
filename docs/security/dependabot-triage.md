# Dependabot Triage Plan (Bulk Execution)

Last refreshed: 2026-07-02 via `gh api repos/OmniFlexFitness/OmniTask/dependabot/alerts`.

## Snapshot

- Open alerts: `101`
- Severity mix: `critical: 3`, `high: 36`, `medium: 50`, `low: 12`
- By manifest:
  - `yarn.lock`: `56`
  - `functions/package-lock.json`: `44`
  - `functions/package.json`: `1`

Most frequent packages currently flagged: `protobufjs (12)`, `dompurify (12)`, `nodemailer (7)`, `undici (7)`, `fast-xml-parser (6)`, `hono (5)`.

## Batch Map

### Batch 1 (critical-first)

- App: bump direct `vitest` to `^3.2.6`
- Functions: add npm `overrides` for:
  - `protobufjs` -> `^7.6.3`
  - `fast-xml-parser` -> `^5.7.0`

Target: clear criticals tied to vitest/protobufjs/fast-xml-parser and establish an overrides mechanism for functions.

### Batch 2 (functions high-risk cluster)

- Functions direct dep:
  - `nodemailer` -> patched line (`>=9.0.1`)
- Functions overrides:
  - `@grpc/grpc-js`, `node-forge`, `form-data`, `path-to-regexp`, `minimatch`, `lodash`, `qs`, `picomatch`

Target: collapse the large high-severity backlog in `functions/package-lock.json`.

### Batch 3 (app runtime-risk cluster)

- Angular runtime packages (`@angular/common`, `@angular/core`, `@angular/compiler`) to latest safe `21.2.x`
- App deps/resolutions:
  - `dompurify`, `undici`, `vite`, `form-data`, `tar`

Target: remove browser/runtime-relevant app advisories before lower-risk toolchain packages.

### Batch 4 (dev/build toolchain advisories)

- App resolutions for tooling-only packages:
  - `hono`, `piscina`, `sigstore`, `@sigstore/verify`, `@sigstore/core`
  - `launch-editor`, `webpack-dev-server`, `http-proxy-middleware`
  - `esbuild`, `postcss`, `ip-address`, `ajv`, `uuid`, `@babel/core`

Target: reduce remaining backlog while isolating potential CI/tooling regressions.

### Batch 5 (no-fix / disputed / platform-limited)

Document and dismiss only when all are true:
- no patched version currently published, or
- advisory applies only to local dev flows not used in CI/prod, or
- upstream advisory is duplicated by a newer tracked advisory.

Current likely candidates:
- `dompurify` advisories with `first_patched_version: none`
- Windows-only local dev server path/UNC advisories when not exposed in prod

## Verification Gate Per Batch

### App gate

1. `corepack yarn install`
2. `yarn lint`
3. `yarn build`
4. `yarn test`

### Functions gate

1. `cd functions`
2. `npm install`
3. `npm run build`
4. `npm test`

### Alert gate

- Re-check open alerts:
  - `gh api repos/OmniFlexFitness/OmniTask/dependabot/alerts --paginate`
- Confirm targeted package alerts for that batch are reduced or resolved before opening next batch.
