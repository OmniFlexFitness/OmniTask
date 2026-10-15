# OmniTask Priority Backlog

**Canonical tracker:** GitHub Projects (OmniFlexFitness org) — OmniTask Issues are largely closed/migrated.  
**Repo:** [OmniFlexFitness/OmniTask](https://github.com/OmniFlexFitness/OmniTask)  
**Production branch:** `live`

> Local `gh` needs `read:project` to list Projects cards. See `../../docs/omniflex-phase4-tracker.md` in the parent omniflexfitness workspace (or refresh scopes with `gh auth refresh -s read:project,project`).

---

## Maintenance mode (2026-10-15)

OmniTask is in **maintenance** after the ecosystem triage-merge. Feature work is paused pending GCP billing restore and business priority (website + MindMap fork).

### Shipped this triage

| PR | Title | Notes |
|----|-------|-------|
| [#204](https://github.com/OmniFlexFitness/OmniTask/pull/204) | CI baseline unblock | Merged |
| [#206](https://github.com/OmniFlexFitness/OmniTask/pull/206) | Dependabot batches 1+2 (v2) | Merged (included batch 1 commits) |
| [#209](https://github.com/OmniFlexFitness/OmniTask/pull/209) | Dependabot batch 3 (v2, rebased) | Merged |
| [#199](https://github.com/OmniFlexFitness/OmniTask/pull/199) | SMTP secrets runbook | Merged |

Closed as stale/duplicate: #200–#203 (v1 security batches), #208 (duplicate of #193).

### Deploy blocker

`Deploy to Cloud Run & Firebase` fails at **Push Docker image**: GCP project billing disabled on `omnitask-475422`.  
Bertin/ops must re-enable billing, then re-run the latest deploy workflow on `live`.

Production Hosting URLs still respond 200 with the last successful image:

- https://task.omniflexfitness.com
- https://omnitask-475422.web.app

### Ops still open

| Item | Status |
|------|--------|
| [#91](https://github.com/OmniFlexFitness/OmniTask/issues/91) SMTP secrets | Manual `gcloud` + Gmail App Password — see `docs/runbooks/configure-firebase-smtp-secrets.md` |

---

## Historical tiers (archived reference)

Older issue-driven tiers (#125–#184, GitHub integration phases) are documented in git history and closed PRs. Do not reopen large feature streams until billing + Projects board triage are done.

See also: `docs/plans/github-issues-integration.md`.

---

## Workflow notes

- Branch from `live`: `fix/`, `feat/`, `chore/`
- Run `ng build --configuration production` and `ng test --watch=false --browsers=ChromeHeadless` before PR
- See [CONTRIBUTING.md](../../CONTRIBUTING.md) and [AGENTS.md](../../AGENTS.md)
