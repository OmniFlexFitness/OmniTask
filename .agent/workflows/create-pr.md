---
description: Create a new feature branch with proper naming and setup
---

# Feature Branch Workflow

This workflow creates properly named feature branches following OmniTask conventions.

## Branch Naming Convention

| Type | Prefix | Example |
|------|--------|---------|
| New feature | `feature/` | `feature/google-calendar-sync` |
| Bug fix | `fix/` | `fix/task-drag-drop-regression` |
| Hotfix | `hotfix/` | `hotfix/auth-token-refresh` |
| Documentation | `docs/` | `docs/api-integration-guide` |
| Refactor | `refactor/` | `refactor/task-service-signals` |

## Workflow Steps

### 1. Ensure Clean Working Directory

```bash
# Check for uncommitted changes
// turbo
git status --porcelain
```

If there are changes, either commit or stash them first.

### 2. Update Live Branch

```bash
# Fetch and pull latest from live
// turbo
git checkout live
git pull origin live
```

### 3. Create Feature Branch

```bash
# Create and switch to new branch
// turbo
git checkout -b feature/{description}
```

Use kebab-case for the description (lowercase, hyphens between words).

### 4. Make Initial Commit (Optional)

If creating scaffolding:

```bash
# Stage and commit initial files
git add .
git commit -m "feat({scope}): initial {feature} scaffolding"
```

### 5. Push Branch

```bash
# Push to remote and set upstream
// turbo
git push -u origin HEAD
```

### 6. Create Draft PR (Optional)

```bash
# Create a draft pull request
gh pr create --draft --title "feat({scope}): {description}" --body "## Summary

[Description of the feature]

## Changes

- [ ] Task 1
- [ ] Task 2

## Testing

- [ ] Unit tests
- [ ] Manual testing
"
```

## Best Practices

1. **Keep branches focused** - One feature per branch
2. **Update frequently** - Merge/rebase from `live` regularly
3. **Use draft PRs** - Mark as ready when complete
4. **Delete after merge** - Clean up merged branches

## Branch Protection

- `live` branch is protected - requires PR review
- Direct pushes to `live` are not allowed
- All PRs trigger CI/CD checks
