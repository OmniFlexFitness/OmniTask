# User Management Expansion — Profiles, Dashboard Settings, Per-Project Roles

> Status: in progress
> Branch: `claude/ecstatic-mccarthy-wqo878`
> Author: Claude Code

## Scope

Expand OmniTask's user-management surface in four ways:

1. **Individual profiles** — each user keeps their own profile. Add lightweight
   profile fields (`jobTitle`, `bio`, `timezone`) on top of the existing
   display name / avatar / photo, surfaced in **Settings**.
2. **Dashboard settings & views** — let each user configure how their personal
   **My Tasks** dashboard opens and looks (default pane, compact density,
   personal accent color). Persisted on the user profile.
3. **Per-project admins** — let a project owner grant another member elevated
   "project admin" rights for that specific project (manage members, edit
   settings). Backed by a new `adminIds` array on `Project`.
4. **Ownership transfer** — let an owner hand a project to another current
   member. The previous owner stays on as a project admin.

Out of scope (noted as future work): a read-only "Viewer" project role,
finer-grained per-field write restrictions for regular members, and a
dedicated public profile page.

## Design decisions

- **`memberIds` stays the membership source of truth.** The whole app and the
  Flutter companion query projects with `where('memberIds','array-contains',uid)`.
  Rather than reshape membership into `ProjectMember[]` (a risky migration
  across every query path + rules), per-project admins are an **additive**
  `adminIds: string[]` subset of `memberIds`. Owner is implicitly the top admin.
- **Role hierarchy:** `owner` > `admin` > `member`.
  - *Owner*: everything, including delete, transfer ownership, and grant/revoke
    project admins.
  - *Admin*: manage members + edit project settings. Cannot delete, transfer,
    or change the admin roster.
  - *Member*: collaborate (create/edit tasks, edit shared project fields) as
    today.
- **Server-side enforcement is mandatory.** Client checks are convenience only;
  the capability is enforced in `firestore.rules` so it cannot be bypassed.
- **Dashboard settings are user-owned, non-privileged fields.** They write to
  the user's own doc and need no rules change (existing self-update rule already
  permits non-role/non-permission field writes).

## Files affected

| File | Change |
|------|--------|
| `src/app/core/models/user.model.ts` | `UserDashboardSettings` + defaults + `resolveDashboardSettings()`; add `jobTitle`/`bio`/`timezone`/`dashboardSettings` to `UserProfile` |
| `src/app/core/models/domain.model.ts` | `adminIds?` on `Project`; `ProjectRole`, `getProjectRole()`, `isProjectManager()` |
| `src/app/core/services/project.service.ts` | `setProjectAdmin()`, `transferOwnership()`; `removeMember()` also strips `adminIds` |
| `src/app/core/services/project.service.spec.ts` | Tests for the three above |
| `src/app/features/projects/components/project-member-manager.component.ts` + `.html` | Role badges + owner/admin controls (make/remove admin, transfer ownership), gating by current user's role |
| `src/app/features/settings/settings.component.ts` + `.html` | Profile fields (`jobTitle`, `bio`) + new "Dashboard" settings section |
| `src/app/features/my-tasks/my-tasks.component.ts` + `.css` | Seed default pane from settings; apply compact density + accent color |
| `firestore.rules` | Project update gating for `ownerId` / `adminIds` / `memberIds` |
| `docs/plans/user-management-expansion.md` | This plan |

## Implementation steps

1. Models: dashboard settings + profile fields (user.model), `adminIds` + role
   helpers (domain.model).
2. Service: admin grant/revoke, ownership transfer, member-removal cleanup.
3. Firestore rules: owner-only `ownerId`/`adminIds`; project-admin-gated
   `memberIds`.
4. Member-manager UI: badges + contextual actions, gated by role.
5. Settings UI: profile fields + dashboard settings section.
6. My Tasks: consume dashboard settings (default view, density, accent).
7. Tests + `ng build` + `ng test` + `ng lint`.

## Firestore rules change (behavior delta)

The project `update` rule is tightened so that:

- changing `ownerId` requires being the **current owner** (or a global
  admin/super-admin),
- changing `adminIds` requires being the **current owner**,
- changing `memberIds` requires being a **project admin** (owner or in
  `adminIds`) **and** holding the global `canInviteMembers` permission.

Regular members can still edit non-sensitive project fields (sections, tags,
description, etc.) exactly as before. This intentionally moves member management
from "any member with `canInviteMembers`" to "project admins" — that is the
"admin permissions for a specific project" capability being added.

Existing projects have no `adminIds` field; `adminIds is list` guards treat that
as "owner is the only manager", so behavior is unchanged until an owner appoints
an admin.

## Test plan

- Unit: `project.service.spec.ts` — admin add/remove (incl. owner + non-member
  guards), transfer (owner-only, member-only target, swaps owner↔admin),
  member removal also drops admin.
- Build: `ng build --configuration production`.
- Lint/tests: `ng test --watch=false` and `ng lint`.
- Manual (post-deploy of rules): owner appoints admin → admin can add/remove
  members but not transfer; owner transfers → new owner gains control, old owner
  becomes admin.

## Rollback

- Pure additive model/service/UI changes: revert the commit. `adminIds` is
  optional and ignored by old code.
- Rules: keep the previous `firestore.rules` revision; re-deploy it. Because the
  new fields are additive, reverting rules only relaxes the member-management
  gate back to the prior behavior — no data migration required.
