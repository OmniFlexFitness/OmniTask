# omnitask — Standing Instructions for Antigravity Agents

This file is read by every Antigravity agent operating in this workspace. It encodes OmniTask conventions so agents do not have to be reminded each session.

> **Source of truth**: `GEMINI.md` is the canonical project map for stack, architecture, file structure, services registry, and data schema. This file (AGENTS.md) carries agent-behavior rules and OmniFlex-ecosystem context. When the two disagree on stack details, GEMINI.md wins. When they disagree on agent behavior, this file wins.

> **Companion docs**: `CLAUDE.md` mirrors this file for Claude Code, with additional CLI workflow rules. `.github/copilot-instructions.md` covers GitHub Copilot. Keep all four roughly in sync when stack or convention changes land.

---

## Project Identity

- **Name**: omnitask
- **Description**: OmniTask — Angular 21 + Firebase task management application (Asana-like feature parity)
- **Org**: OmniFlex LLC (DBA OmniFlex Fitness) — OmniTask is part of the OmniFlex brand ecosystem
- **Founder/sole maintainer**: Bertin Kenol
- **Production branch**: `live` (deploys to Cloud Run via GitHub Actions on push)
- **Default working branch**: `dev`; feature branches off `live` per `/feature-branch` workflow

---

## Stack (summary — full detail in GEMINI.md)

### Frontend
- **Angular 21** with **standalone components**, **signals**, **`inject()`** dependency injection, **OnPush** change detection
- **TypeScript 5.9** strict mode
- **TailwindCSS 3** with custom dark theme; design system per GEMINI.md "Brand Colors"
- **No NgModules** — standalone components exclusively
- **Signal-first state management** — prefer `signal()` and `computed()` over RxJS BehaviorSubject

### Backend
- **Firebase**: Firestore (modular API only), Authentication (email/password + Google SSO), Cloud Functions (Node.js 20.x)
- **Firebase project**: `omnitask-475422`
- **Firestore security rules**: version 2; production rules active
- **Functions**: TypeScript, deployed via `firebase deploy --only functions`

### Deployment
- **Production**: Google Cloud Run (Docker + Nginx) via GitHub Actions on push to `live`
- **Static assets / Functions**: Firebase Hosting + Firebase Functions
- **CI/CD**: GitHub Actions (build, test, deploy)

### Tooling
- **Version control**: Git, hosted on GitHub at `OmniFlexFitness/OmniTask`
- **Package manager**: npm (lockfile NOT committed; see `.gitignore`)
- **Local dev**: `npm install && ng serve` → `http://localhost:4200`
- **Firebase emulators**: `firebase emulators:start` for offline Firestore/Functions testing

---

## Brand

OmniTask sits inside the OmniFlex brand ecosystem but uses its own product-specific palette (cyberpunk-adjacent, glassmorphism-heavy, dark-mode-first). The OmniFlex Nexus / FitMatch neon palette does NOT apply here.

### Visual Identity (per GEMINI.md "Brand Colors")
- **Primary Purple**: `#8b5cf6` — primary actions, CTAs
- **Secondary Blue**: `#3b82f6` — secondary actions, links, info states
- **Accent Cyan**: `#06b6d4` — glows, highlights, hover accents
- **Background**: `#0f0f0f` to `#1a1a1a` (dark)
- **Surface**: `rgba(255,255,255,0.05)` (glassmorphism panels)

### Voice (OmniFlex-wide)
- **Confident**: take a stance based on evidence; do not hedge unnecessarily
- **Direct**: short sentences over long ones; active voice over passive
- **Anti-hype**: do not use "game-changing," "revolutionary," "cutting-edge," or similar empty boosters
- **No-nonsense**: error messages lead with what happened, then what the user can do

---

## Code Conventions

### Architecture (per GEMINI.md "Behavioral Rules")

Enforced (do these):
- **Standalone components**: every component must use `standalone: true`
- **Signals over BehaviorSubject**: `signal()` and `computed()` are the default
- **`inject()` for DI**: never constructor injection
- **OnPush change detection**: default to `changeDetection: ChangeDetectionStrategy.OnPush`
- **Service layer for Firestore**: components NEVER call Firestore directly; route through `core/services/`
- **Error handling**: try/catch around all Firestore calls, log to console, surface user-friendly toast via `ToastService`

Forbidden (do not do these):
- **No `any` type** — use `unknown` if uncertain
- **No constructor DI** — always `inject()`
- **No silent failures** — every catch must at minimum log
- **No raw error messages to users** — use `ToastService` with friendly text
- **No NgModules**
- **No legacy Firebase compat API** — modular API (`@angular/fire/firestore`) only

### File Structure (per GEMINI.md)

```
src/app/
├── core/
│   ├── models/         # TypeScript interfaces (Project, Task, User, etc.)
│   ├── services/       # AuthService, ProjectService, TaskService, ThemeService, ToastService
│   └── guards/         # Route guards
├── features/
│   ├── dashboard/
│   ├── projects/
│   ├── tasks/
│   ├── calendar/
│   └── settings/
└── shared/
    └── components/     # Reusable buttons, modals, inputs
```

Match this layout exactly. New features go under `features/{name}/` with their own components, services-if-needed, and templates.

### Commit Discipline
- **Conventional commits**: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`, `ci:`
- **Subject line**: imperative mood, ≤72 chars, no trailing period
- **Body**: explain *why*, not *what*
- **No commits to `live`** — feature branches only, merge via PR (CI/CD deploys on push to `live`, so direct commits ship straight to production)
- **Branch naming**: `feature/`, `fix/`, `chore/`, `claude/`, `codex/` prefixes per existing repo convention

---

## Workflow Rules

### Planning
- For changes touching more than 3 files, generate a plan in `docs/plans/{feature_name}.md` before writing code
- Plans must include: scope, files affected, implementation steps, test plan, rollback consideration
- Use the `/feature-branch` workflow for properly named branches (per GEMINI.md "Available Workflows")

### Testing
- Run `ng test` before declaring any task done
- Run `ng build --configuration production` to catch production-only build issues
- Run `ng lint` if configured
- Confirm all green before committing
- Every new component/service should have at least a smoke test

### Multi-Agent Coordination (Manager View)
When running parallel agents in Antigravity:
- **Agent A**: feature implementation in `src/app/features/{name}/`
- **Agent B**: related tests
- **Agent C**: documentation updates and Firestore rule changes
- Agents do not share write access to overlapping files; coordinate via the plan artifact

### Reviewing Agent Output
Before approving a Manager View artifact:
1. Confirm files changed match the plan
2. Confirm no `any` types introduced
3. Confirm Firestore calls live in services, not components
4. Confirm components use `standalone: true`, OnPush, `inject()`, and signals where applicable
5. Confirm error paths log AND surface user-friendly messages
6. Confirm no new top-level npm packages without justification in the commit body

---

## Forbidden Without Explicit Approval

These are footguns that have caused real OmniTask production issues. Do not perform them without asking first:

- Modifying `package.json` to add or upgrade dependencies (always show the diff and the reason)
- Modifying `firebase.json`, `firestore.rules`, `firestore.indexes.json`, or `storage.rules` without showing the diff first
- Modifying `angular.json` or `tsconfig*.json`
- Modifying CI workflows in `.github/workflows/`
- Modifying `Dockerfile`, `nginx.conf`, or anything in the deploy chain
- Force-pushing to ANY branch
- Pushing or merging directly to `live` (production deploy is automatic on push to `live`)
- Deleting tests "to make CI pass"
- Committing files matching `*-key.json`, `service-account*.json`, `.env*`, `firebase-sa-key.json` — these are gitignored for a reason
- Running migrations or schema changes against the production Firebase project (`omnitask-475422`) — use the emulators

---

## Useful Context Locations

- **GEMINI.md** (this repo, root) — canonical project map; check first for stack/architecture/services questions
- **`.github/copilot-instructions.md`** (this repo) — Copilot's view of the same conventions
- **`.gemini/styleguide.md`** (this repo) — style nuances Gemini Code Assist reads
- **Obsidian vault**: `C:/OmniFlex Vault/`
  - `Tech/` — technical decision logs, ADRs, troubleshooting notes
  - `Knowledge/` — cross-cutting reference material
  - `Design/` — brand guidelines, design system specs
- **Brand assets**: Adobe Creative Cloud Library "OmniFlex Brand"
- **Figma**: design system source of truth for OmniTask components
- **Drive**: `omniflexfitness.com` Workspace, organized by Brand/Content/Products/Internship/Research/Tech/Personal

When agent tasks reference visual specs or business context, check these locations via the appropriate MCP server before guessing.

---

## Skills Available in This Workspace

Located under `.antigravity/skills/`:

- `omniflex-firestore-rules/` — Firestore security rule patterns and templates (universal across OmniFlex Firebase projects)
- `omniflex-content-brief/` — Educational content drafting in OmniFlex Voice
- `omniflex-code-review/` — Pre-commit code review checklist (review for Angular relevance; some items may be Flutter-flavored from the template)

The original template included a `omniflex-flutter-widget/` skill; it was removed for this workspace. The Angular web app is the primary surface, but a Flutter mobile companion now lives at `mobile/` (see "Mobile (Flutter)" below) — the OmniFlex code-review checklist applies to both.

---

## Mobile (Flutter)

The `mobile/` directory holds the OmniTask iOS + Android companion app, built with Flutter. It shares the `omnitask-475422` Firebase backend (Auth, Firestore, Cloud Functions, Storage) — no separate database. See `docs/plans/omnitask-mobile-flutter.md` for the roadmap.

Stack: Flutter 3.27+ stable, Riverpod 2.x, `go_router`, FlutterFire (core/auth/firestore/functions/storage/messaging/app_check), `google_sign_in`, design system at `mobile/packages/omniflex_design_system/`.

When a task references mobile-specific work, operate inside `mobile/` and follow the Flutter side of the OmniFlex code-review checklist (`AsyncValue` handling, `OmniFlexColors`/`Typography`/`Spacing`/`Effects`, `go_router` routes, no `print`, no App Check bypass). The Cloud Run web deploy chain ignores `mobile/` (see `.dockerignore`); pushes to `mobile/**` should not be sent to `live` until web parity is intentional.

---

## Learned User Preferences

- Do not create git commits unless the user explicitly asks
- When scoping OmniTask engineering work, ignore content/marketing tasks on other OmniTask projects (e.g. Zenith Pre-Workout Launch, Fitness Content Calendar)
- Current engineering priority order: GitHub #91 SMTP secrets, drag-to-create subtask, GitHub #182 → #183 → #184, then Google Calendar sync
- Run `ng test --watch=false --browsers=ChromeHeadless` and `ng build --configuration production` before declaring frontend work complete
- Use `npm install --legacy-peer-deps` when npm reports peer dependency conflicts
- Jonny Terrero develops in Cursor; local GitHub CLI auth is typically `jonnyterrero`

---

## Learned Workspace Facts

- Cursor workspace root is `Omniflexfitness/`; the OmniTask app repo is cloned at `OmniTask/` (GitHub `OmniFlexFitness/OmniTask`, production branch `live`, Firebase `omnitask-475422`)
- Production app URL: https://task.omniflexfitness.com (Firebase Hosting behind Cloudflare; project data requires auth)
- Pre-existing production bundle budget failure (~1.20 MB initial vs 1.10 MB limit); treat as known baseline, not a regression from recent agent changes
- Firebase Console browser login does not authenticate Firebase CLI or MCP; GitHub web login does not authenticate local `gh` until `gh auth login`
- GitHub integration backlog is sequential: #179 done, then #182 → #183 → #184 (see `docs/plans/priority-backlog.md` and `docs/plans/github-issues-integration.md`)
- #91 SMTP ops: `scripts/inject-smtp-secrets.ps1` and `docs/runbooks/configure-firebase-smtp-secrets.md`; requires `gcloud auth login` plus a Gmail App Password (Secret Manager secrets `EXT_MAIL_SMTP_*`, optional `NODEMAILER_SMTP_PASSWORD`)
- `firestore-send-email` extension is deployed and ACTIVE on `omnitask-475422`
