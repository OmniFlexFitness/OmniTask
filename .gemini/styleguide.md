# OmniTask Code Review Style Guide

Follow these guidelines when reviewing code in this repository.

## Angular Best Practices

### ✅ DO

- Use **standalone components** with `standalone: true`
- Use `inject()` function for dependency injection
- Use **signals** (`signal()`, `computed()`) for reactive state
- Use `takeUntilDestroyed()` for subscription cleanup
- Use `OnPush` change detection strategy
- Keep components focused and single-responsibility

### ❌ DON'T

- Don't use constructor injection (prefer `inject()`)
- Don't use BehaviorSubject when signals would work
- Don't forget to unsubscribe from observables
- Don't use NgModules (use standalone components)

---

## TypeScript Conventions

### ✅ DO

- Use **strict mode** TypeScript
- Use **single quotes** for strings
- Keep lines under **100 characters**
- Define interfaces in `src/app/core/models/`
- Type all function parameters and return values
- Use `readonly` for injected services

### ❌ DON'T

- Don't use `any` type (use `unknown` if needed)
- Don't use string concatenation for Firestore paths
- Don't expose raw error messages to users

---

## Firebase/Firestore Patterns

### ✅ DO

- Use modular Firestore API (`collection`, `doc`, `query`)
- Use `collectionData()` with `{ idField: 'id' }`
- Use `writeBatch()` for bulk operations
- Store dates as Firestore `Timestamp` or `Date`

### ❌ DON'T

- Don't use the old compat Firebase API
- Don't make Firestore calls directly in components

---

## Error Handling

### ✅ DO

```typescript
try {
  await this.service.operation();
  this.showToast('Success!', 'success');
} catch (error) {
  console.error('Operation failed:', error);
  this.showToast('Something went wrong', 'error');
}
```

### ❌ DON'T

```typescript
// Bad: Silent failure
this.service.operation().catch(() => {});

// Bad: Exposing raw error
this.showToast(error.message, 'error');
```

---

## UI/UX Guidelines

### OmniFlex Brand Aesthetic

- **Theme**: Dark mode with glassmorphism
- **Primary Color**: Purple `#8b5cf6`
- **Secondary Color**: Blue `#3b82f6`
- **Accent**: Cyan `#06b6d4`

### Required Patterns

- Show loading spinners during async operations
- Provide helpful empty states with CTAs
- Use confirmation dialogs for destructive actions
- Include smooth micro-animations (hover, transitions)

---

## Commit Messages

Follow Conventional Commits:

```
feat(tasks): add drag-and-drop reordering
fix(auth): resolve token refresh loop
docs: update README with deployment info
refactor(services): extract shared logic
```

---

## PR Review Comment Markers

When leaving review comments, use these markers:

| Marker | Purpose |
|--------|---------|
| `[skip]` | AI should NOT implement this |
| `[include]` | AI should implement this |
| `[critical]` | Must be fixed before merge |
| `[optional]` | Nice-to-have improvement |
