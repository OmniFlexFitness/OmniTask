# OmniTask - Gemini Code Assist Context

## Project Overview

**OmniTask** is a modern task management application built with Angular 21 and Firebase, targeting feature parity with Asana's free tier. The UI follows the "OmniFlex" brand with a dark, premium, cyberpunk-inspired aesthetic.

## Technology Stack

- **Frontend**: Angular 21 (standalone components, signals, inject())
- **Styling**: TailwindCSS 3 with custom dark theme
- **Backend**: Firebase (Firestore, Authentication, Functions)
- **Deployment**: Docker + Nginx on Google Cloud Run
- **CI/CD**: GitHub Actions

## Primary Colors

- **Purple**: `#8b5cf6` (primary actions, CTAs)
- **Blue**: `#3b82f6` (secondary actions, links)
- **Cyan accent**: `#06b6d4` (glows, highlights)

---

## AI-Assisted PR Review Behavior

### Trigger Keywords

When you see these triggers in PR comments, take the corresponding action:

| Trigger | Action |
|---------|--------|
| `@implement` | Implement ALL non-skipped review comments |
| `@implement @comment-{id}` | Implement a specific comment by GitHub ID |
| `@implement --only=gemini` | Only implement Gemini's comments |
| `@implement --only=codex` | Only implement Codex/Copilot's comments |
| `@implement --exclude=@username` | Exclude a specific user's comments |

### Comment Selection Markers

Reviewers can mark their comments for inclusion/exclusion:

| Marker | Meaning |
|--------|---------|
| `[skip]` | Do NOT implement this comment |
| `[include]` | Explicitly include this comment |
| `[critical]` | High priority - implement first |
| `[optional]` | Nice-to-have, implement if time allows |

### Commit Workflow

> **🚨 CRITICAL: Push directly to the PR branch. NEVER create a new PR.**

When implementing review comments:

1. **Checkout** the PR's source branch
2. **Implement** the requested changes
3. **Commit** with a detailed message listing addressed comments
4. **Push** directly to the branch to update the existing PR

### Commit Message Format

```
fix: address PR review feedback

Implemented changes from review comments:
- [Gemini #123] Added null check to task loading
- [Codex #456] Refactored service to use signals
- [Gemini #789] Fixed CSS hover state

Skipped comments:
- [#999] Marked as [skip] by reviewer

Co-authored-by: gemini-code-assist[bot] <...>
Co-authored-by: github-copilot[bot] <...>
```

---

## Coding Conventions

Follow these patterns when implementing changes:

### Angular Components
- Use standalone components with `standalone: true`
- Use `inject()` for dependency injection
- Use signals (`signal()`, `computed()`) for reactive state
- Use `takeUntilDestroyed()` for RxJS cleanup

### Services
- Use `@Injectable({ providedIn: 'root' })`
- Expose `loading` and `error` signals
- Use Firestore's modular API

### Error Handling
- Always use try-catch with proper error typing
- Log to console, display user-friendly messages
- Never expose raw errors to users

### UI/UX
- Dark mode with glassmorphism effects
- Purple/blue gradient accents
- Smooth micro-animations
- Loading spinners for async operations
- Confirmation dialogs for destructive actions

---

## File Structure

```
src/app/
├── core/           # Auth, services, models, theme
├── features/       # Dashboard, projects, tasks
└── shared/         # Reusable components
```

## Related Configuration

- GitHub Copilot: `.github/copilot-instructions.md`
- Gemini Style Guide: `.gemini/styleguide.md`
- Gemini Config: `.gemini/config.yaml`
