---
name: omniflex-firestore-rules
description: Use when writing, modifying, or reviewing Firestore security rules for any OmniFlex project (Nexus, FitMatch, Zenith microsite, etc.). Also activates on Storage rule prompts since the patterns are similar. Ensures rules follow OmniFlex's defense-in-depth posture and match the standard collection structure used across OmniFlex Firebase projects.
---

# OmniFlex Firestore & Storage Security Rules

OmniFlex Firebase projects share a common security posture. This skill encodes that posture so rules stay consistent across projects.

## Activation Triggers

Activate this skill when a prompt mentions any of:
- Firestore rules, security rules, `firestore.rules`
- Storage rules, `storage.rules`
- Permission denied errors during Firebase reads/writes
- Adding a new collection that needs access control
- Reviewing or auditing existing rules

## OmniFlex Defense-in-Depth Posture

1. **Default deny**: every collection is denied by default. Allow rules are explicit.
2. **Authentication required**: no anonymous reads or writes outside of explicit public collections (e.g., published content like Supplement Sundays cards).
3. **App Check enforcement**: production rules require valid App Check tokens. Debug tokens registered for development.
4. **Owner-or-admin pattern**: documents typically have an `ownerUid` field; access is granted to the owner or an admin custom claim.
5. **Field-level validation**: writes validate field types, required fields, and immutable fields (e.g., `createdAt`, `ownerUid` cannot be modified after initial write).
6. **Rate limiting**: writes that could be spammed (social posts, FitMatch likes, comments) include a `request.time` cooldown check against the last document.

## Standard Helper Functions

Every OmniFlex `firestore.rules` file should define these helpers at the top of `match /databases/{database}/documents`:

```
function isAuthenticated() {
  return request.auth != null;
}

function isAppCheckValid() {
  return request.auth != null && request.app_check != null;
}

function isOwner(resource) {
  return isAuthenticated() && resource.data.ownerUid == request.auth.uid;
}

function isAdmin() {
  return isAuthenticated() && request.auth.token.admin == true;
}

function isOwnerOrAdmin(resource) {
  return isOwner(resource) || isAdmin();
}

function fieldsAreValidOnCreate(required, optional) {
  return request.resource.data.keys().hasAll(required)
    && request.resource.data.keys().hasOnly(required.concat(optional));
}

function isImmutableFieldUnchanged(fieldName) {
  return !(fieldName in request.resource.data)
    || resource.data[fieldName] == request.resource.data[fieldName];
}
```

## Common Patterns

See `templates/base-rules.rules` for a complete starting point covering:

- User profile collection (owner read/write, public read of subset via separate `publicProfiles` collection)
- Workout logs (owner-only)
- Social feed posts (authenticated read, owner write, rate limited to 1 post per 30 seconds)
- Match queue (FitMatch — authenticated read of own queue, no client writes)
- Public content (Supplement Sundays cards, OmniFacts) — public read, admin write only

## Review Checklist for Existing Rules

When asked to review existing rules, run through:

1. Is there a top-level default-deny? `match /{document=**} { allow read, write: if false; }` should be the last rule.
2. Are admin-only collections actually admin-only, or do they leak via wildcard rules?
3. Do create/update operations validate required fields?
4. Are immutable fields (`createdAt`, `ownerUid`) protected on update?
5. Are list operations restricted appropriately? `allow list` is often forgotten and defaults to allowing unbounded queries.
6. Is App Check enforced where it matters?
7. Are there any rate-limit-able write paths without cooldown checks?

## Common Mistakes to Catch

- **`allow read` without scoping `get` vs `list`**: someone can list a whole collection when you only meant to allow single-doc gets
- **Missing `request.resource.data` validation on `update`**: lets clients write arbitrary new fields
- **Comparing `request.resource.data.x == resource.data.x` for mutable fields**: this prevents legitimate updates
- **Calling `get()` inside rules without batching consideration**: rule evaluations cost reads and can blow up costs
- **Forgetting that `update` rules need both old and new data validation**: both `resource` (existing) and `request.resource` (proposed) must be validated

## Output Format

When generating new rules:
1. Show the helpers section first
2. Group rules by feature/collection with section comments
3. End with the explicit default-deny
4. After the rules block, list test cases that should pass and fail (paste-ready into `firestore.rules.test.js` or the emulator UI)
