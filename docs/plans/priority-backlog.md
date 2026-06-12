# OmniTask Priority Backlog

Reference list for open GitHub issues, ordered by impact and dependency. Update status in issue comments when work starts or completes.

**Repo:** [OmniFlexFitness/OmniTask](https://github.com/OmniFlexFitness/OmniTask)  
**Production branch:** `live`

---

## Tier 1 — Production Blockers

| Issue | Title | Status |
|-------|-------|--------|
| [#125](https://github.com/OmniFlexFitness/OmniTask/issues/125) | Production build fails — bundle size exceeds 1 MB budget | Done (PR pending) |
| [#126](https://github.com/OmniFlexFitness/OmniTask/issues/126) | 30 npm audit vulnerabilities (1 critical handlebars) | Done (PR pending) |

---

## Tier 2 — Critical UX / Accessibility

| Issue | Title | Status |
|-------|-------|--------|
| [#129](https://github.com/OmniFlexFitness/OmniTask/issues/129) | No mobile navigation — app unusable on small screens | Done (PR #165) |
| [#117](https://github.com/OmniFlexFitness/OmniTask/issues/117) | Task list drag-and-drop reordering broken | Done (PR #165) |

---

## Tier 3 — High-Value Features

| Issue | Title | Status |
|-------|-------|--------|
| [#130](https://github.com/OmniFlexFitness/OmniTask/issues/130) | Global task search bar (project list filter; Phase 2: navbar) | Done (PR #165) |
| [#131](https://github.com/OmniFlexFitness/OmniTask/issues/131) | Complete Google Tasks API OAuth integration | Partial (`/auth/callback` route; real OAuth TBD) |
| [#133](https://github.com/OmniFlexFitness/OmniTask/issues/133) | Data export/import (CSV/JSON) | Export done (PR #165) |
| [#137](https://github.com/OmniFlexFitness/OmniTask/issues/137) | Google Sheets sync field-level merge | Done (PR #165) |

---

## Tier 4 — Quality of Life

| Issue | Title | Status |
|-------|-------|--------|
| [#123](https://github.com/OmniFlexFitness/OmniTask/issues/123) | Add 404 Not Found page | Done (PR #165) |
| [#132](https://github.com/OmniFlexFitness/OmniTask/issues/132) | Keyboard shortcuts (`?`, `Ctrl+K`, `Esc`) | Done (PR #165) |
| [#119](https://github.com/OmniFlexFitness/OmniTask/issues/119) | Settings page improvements | Done (PR #165) |

---

## Tier 5 — Tech Debt / Cleanup

| Issue | Title | Labels |
|-------|-------|--------|
| [#121](https://github.com/OmniFlexFitness/OmniTask/issues/121) | Add ESLint configuration | tech-debt |
| [#122](https://github.com/OmniFlexFitness/OmniTask/issues/122) | Remove console.log from production | cleanup |
| [#124](https://github.com/OmniFlexFitness/OmniTask/issues/124) | Remove deprecated `allowSignalWrites` | good first issue |
| [#118](https://github.com/OmniFlexFitness/OmniTask/issues/118) | Demo board event handlers are stubs | good first issue |

---

## Tier 6 — Ops

| Issue | Title | Status |
|-------|-------|--------|
| [#91](https://github.com/OmniFlexFitness/OmniTask/issues/91) | Configure Firebase SMTP Secrets | Open — assigned @bkenol; manual GCP Secret Manager step |

---

## Tier 7 — GitHub Integration (sequential)

| Issue | Title | Depends on | Branch prefix |
|-------|-------|------------|---------------|
| [#179](https://github.com/OmniFlexFitness/OmniTask/issues/179) | Phase 1 — connect + bidirectional status sync | — | **Done** (merged to `live`) |
| [#182](https://github.com/OmniFlexFitness/OmniTask/issues/182) | Phase 2 — Issue Types, Fields, sub-issues, dependencies | #179 | **Done** (local; deploy pending) |
| [#183](https://github.com/OmniFlexFitness/OmniTask/issues/183) | Phase 3 — Projects v2 + linked branches / PR status | #182 | **Done** (local; deploy pending) |
| [#184](https://github.com/OmniFlexFitness/OmniTask/issues/184) | Phase 4 — conflict UI, participants, Cloud Tasks, security alerts | #183 | **Partial** — conflict resolution UI + callable; Cloud Tasks / security alerts TBD |

See `docs/plans/github-issues-integration.md` for architecture notes.

---

## Recently completed (context)

- **#179** — GitHub Issues Phase 1 (`56d7a26b` on `live`)
- **#182–#184** — GitHub Phases 2–4 implemented locally (field mirror, Projects v2 settings, conflict resolution UI); deploy + live webhook verification pending
- **Google Calendar sync** — project settings + task CRUD hooks wired locally; manual OAuth/calendar E2E pending
- **Drag-to-create subtask** — list/board views with cycle guard
- PRs #158–#164 merged (pin projects, mobile scaffold, email markdown, CODEOWNERS, auth pin state)

---

## Workflow notes

- Branch from `live` for production fixes: `fix/`, `feat/`, `chore/` prefixes
- Run `ng build --configuration production` and `ng test` before PR
- See [CONTRIBUTING.md](../../CONTRIBUTING.md) and [AGENTS.md](../../AGENTS.md)
