---
description: Debug and fix build failures in CI/CD or local builds
---

# Build Debugging Workflow

This workflow helps diagnose and fix build failures quickly.

## Common Build Errors

| Error Type | Typical Cause | Quick Fix |
|------------|---------------|-----------|
| Type errors | Missing types, `any` usage | Add proper TypeScript types |
| Import errors | Missing/wrong imports | Check import paths |
| Template errors | Invalid Angular syntax | Check `@if`, `@for` syntax |
| Style errors | Invalid CSS/Tailwind | Validate class names |
| Firebase errors | Wrong Firestore types | Check `Timestamp` vs `Date` |

## Workflow Steps

### 1. Reproduce Locally

```bash
# Run the build locally to see full error output
// turbo
yarn build 2>&1 | head -100
```

### 2. Capture Error Details

Note these key pieces:
- **File path** (e.g., `src/app/features/tasks/task-detail-modal.component.ts`)
- **Line number** (e.g., `line 313`)
- **Error code** (e.g., `TS2345`, `NG0100`)
- **Error message** (e.g., `Argument of type 'X' is not assignable to parameter of type 'Y'`)

### 3. View Problematic Code

```bash
# View the file around the error line
// turbo
cat {file} | head -{end_line} | tail -{context_lines}
```

Or use the view_file tool to examine the code.

### 4. Common Fixes

#### TypeScript Type Errors (TS2345, TS2322)

```typescript
// Problem: Object with toDate() passed to Date constructor
const date = new Date(firestoreTimestamp); // ❌ Error

// Fix: Call toDate() first
const date = new Date(firestoreTimestamp.toDate()); // ✅

// Or use type guard
const date = firestoreTimestamp instanceof Date 
  ? firestoreTimestamp 
  : new Date(firestoreTimestamp.toDate());
```

#### Missing Imports

```typescript
// Add missing import
import { signal, computed } from '@angular/core';
```

#### Template Errors

```html
<!-- Problem: Old *ngIf syntax -->
<div *ngIf="loading">...</div>

<!-- Fix: New @if syntax -->
@if (loading()) {
  <div>...</div>
}
```

### 5. Verify Fix

```bash
# Re-run build to verify
// turbo
yarn build
```

### 6. Run Type Check Only (Faster)

```bash
# Just check types without full build
// turbo
npx tsc --noEmit
```

### 7. Commit Fix

```bash
# Commit with descriptive message
git add {file}
git commit -m "fix: resolve {error_type} in {component}"
```

## GitHub Actions Build Failures

### View CI Logs

```bash
# Get recent workflow runs
// turbo
gh run list --limit 5

# View logs for failed run
// turbo
gh run view {run_id} --log-failed
```

### Common CI-Specific Issues

1. **Dependency mismatch** - Run `yarn install` locally
2. **Node version** - Check `.nvmrc` or workflow file
3. **Environment variables** - Check GitHub Secrets

## Quick Reference

```bash
# Full rebuild
// turbo
rm -rf dist node_modules/.cache && yarn build

# Watch mode for iterative fixes
yarn build --watch

# Check for lint errors too
yarn lint
```
