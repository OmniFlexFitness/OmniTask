# Deploy to live without Google Cloud billing (temporary)

Issue: https://github.com/OmniFlexFitness/OmniTask/issues/214

## Scope

Deploys from `live` fail at "Push Docker image" while the Google Cloud project has
no billing ("This API method requires billing to be enabled"). Add a temporary
mode to `.github/workflows/deploy-cloudrun.yml` that ships what the free Firebase
Spark plan allows, and returns to the full deploy by itself once billing is back.

## Files affected

- `.github/workflows/deploy-cloudrun.yml` (only file changed)

## Implementation

1. The push step loops over both image tags. If a push fails and the log contains
   `requires billing to be enabled`, it writes `billing_blocked=true`, emits a
   warning annotation, and exits 0. Any other failure exits non-zero as before.
   Success writes `billing_blocked=false`.
2. When `billing_blocked == 'true'`, these steps are skipped: Cloud Run deploy,
   Functions dependency install, API enable, Secret Manager seeding.
3. The Firebase deploy runs `--only hosting,firestore` in that mode and
   `--only hosting,firestore,functions` otherwise (via `DEPLOY_ONLY`).
4. The final step prints a warning instead of querying Cloud Run.
5. The release tag is still created.

## What is unavailable while billing is off

AI task features, GitHub Issues integration, email notifications, scheduled jobs
(everything in `functions/`). The local stack is unaffected.

## Test plan

- Push-step logic checked against a fake `docker` for three cases: billing error
  (exit 0, `billing_blocked=true`), other error (exit 1), success
  (exit 0, `billing_blocked=false`).
- Workflow YAML parses; skipped steps carry the expected `if:`.
- Real check: the first run on `live` after merge. Hosting and Firestore deploy
  with billing off has not been run end to end before this change.

## Rollback

Revert this PR. The workflow returns to the previous behaviour (fails at the
push step while billing is off, identical to runs 154 to 156).

## Follow-up

Re-enable billing (the real fix), or move the callable functions to a non-Google
host. Either way this mode can stay dormant: with billing on, the push succeeds
and the full path runs unchanged.
