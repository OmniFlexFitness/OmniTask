# Pin Projects to Dashboard

## Scope

Let signed-in users pin any of their projects so the pinned set surfaces in a
dedicated "Pinned" panel at the top of the My Tasks dashboard (the page at
route `/`, rendered by `MyTasksComponent`). Pins are per-user and persist
across sessions.

This is a user-preference feature — not a project-level one — so the pinned
list lives on the user document. There are no Firestore rules changes
required: the existing rule that lets a user update their own
non-privileged profile fields covers writing `pinnedProjectIds`.

Non-goals (for this iteration):
- Reordering pinned projects (alphabetical by name will do)
- Sharing pinned projects across users
- Pinning from the `/workspace` project dashboard sidebar (My Tasks
  dashboard is where pinned projects pay off most; revisit later)

## Files affected

1. `src/app/core/models/user.model.ts` — add `pinnedProjectIds?: string[]`
   to `UserProfile`.
2. `src/app/core/services/user.service.ts` — add a `setPinnedProjects(uid,
   ids)` method (or pin/unpin convenience methods) writing to the user doc.
3. `src/app/features/my-tasks/my-tasks.component.ts` — compute pinned
   projects from `currentUser().pinnedProjectIds + myProjects()`, expose to
   the overview, and add a `togglePinProject(projectId)` handler that
   persists via `UserService` and `AuthService.updateProfile`.
4. `src/app/features/my-tasks/my-tasks.component.html` — wire the new
   inputs/outputs to `<app-my-tasks-overview>`.
5. `src/app/features/my-tasks/components/my-tasks-overview.component.ts` —
   add `pinnedProjectIds` input, `togglePin` output, computed
   `pinnedContributions` and `unpinnedContributions` lists.
6. `src/app/features/my-tasks/components/my-tasks-overview.component.html`
   — render a new "Pinned" section above the rest of the overview when
   there is at least one pin; add pin/unpin icon to each project card in
   "My Projects & Contributions".
7. `src/app/features/my-tasks/components/my-tasks-overview.component.css`
   — small styles for the pin button + pinned panel accent.

## Implementation steps

1. Extend `UserProfile` with `pinnedProjectIds?: string[]`.
2. Add `UserService.setPinnedProjects(uid, ids)` that writes the array
   to the user doc via `updateDoc`.
3. In `MyTasksComponent`:
   - Add `pinnedProjectIds = computed(() => currentUser()?.pinnedProjectIds ?? [])`.
   - Add `togglePinProject(projectId)` that toggles membership in the
     current array and calls `AuthService.updateProfile({pinnedProjectIds})`
     (which also updates the local signal so the UI reacts immediately).
4. Update the overview component:
   - Accept `pinnedProjectIds` input + `togglePin` output.
   - Compute pinned / unpinned splits of `contributions()`.
   - Render a "Pinned" panel when `pinnedContributions().length > 0`,
     using the same project card style (slightly differentiated border).
   - Add a pin/unpin button on every project card.
5. Add minimal CSS for the pin button (icon-only, hover state).

## Test plan

- Unit tests: extend `user.service.spec.ts` to cover
  `setPinnedProjects` writing the expected payload.
- Manual:
  - Pin a project from My Tasks: panel appears at the top.
  - Unpin from the pinned panel or from the contributions card: panel
    hides when last pin removed.
  - Sign out / in: pins survive.
  - Archive a pinned project: it still shows but with the existing
    "Archived" chip.

## Rollback

Pure additive change; no migration. To roll back, revert the commit and
optionally clear `pinnedProjectIds` on user docs (not required — the
field is ignored by older clients).
