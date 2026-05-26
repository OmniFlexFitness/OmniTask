# Contributing to OmniTask

Thanks for helping improve OmniTask. This repo is optimized for fast, safe iteration: small PRs, conventional commits, and guardrails around anything that can ship to production.

## 1) Quickstart

```bash
npm install
ng serve
```

Open `http://localhost:4200/`.

## 2) Branch naming

Use a descriptive branch name with one of these prefixes:

- `feature/` — new capability
- `fix/` — bug fix
- `chore/` — maintenance (non-user-facing)
- `claude/` — work primarily executed with Claude Code
- `codex/` — work primarily executed with Codex/Cursor

**Never commit directly to `live`.** The `live` branch is production.

## 3) Commit style

Use **Conventional Commits**:

- `feat:`
- `fix:`
- `refactor:`
- `chore:`
- `docs:`
- `test:`
- `ci:`

Guidelines:

- Imperative mood, no trailing period
- Keep the subject line concise (≤72 chars)
- Use the body to explain *why* (not just what)

## 4) Pre-PR checklist

Before opening a PR, run:

```bash
ng build --configuration production
ng test --watch=false --browsers=ChromeHeadless
ng lint    # if configured
```

If your change touches Firebase Functions, also run:

```bash
cd functions && npm run build && npm run lint
```

## 5) Agent guidance map

This repo includes multiple “agent guidance” files used by different tools:

- `GEMINI.md`: **canonical project map** (stack, architecture, file layout, services registry, schema). If you’re unsure where something lives, start here.
- `AGENTS.md`: standing instructions and conventions for Antigravity agents in this workspace (workflow rules, guardrails, OmniFlex ecosystem context).
- `CLAUDE.md`: Claude Code overlay (CLI workflow rules + the pre-done checklist).
- `.github/copilot-instructions.md`: GitHub Copilot’s project context and coding conventions.

## 6) Where secrets live

Do **not** commit secrets, tokens, or service-account JSON files.

- Environment variables belong in `~/.bashrc` (or your shell profile equivalent).
- Service account JSON keys belong in `~/.omniflex-secrets/`.

Both locations are intentionally outside the repo. Never add them to git, and never paste them into PRs/issues.

## 7) Architecture / stack questions

For architecture, directory layout, and “how does this work?” questions, see `GEMINI.md`.

