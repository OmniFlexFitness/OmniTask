# Densify the in-project page layout

Tracking issue: [#193](https://github.com/OmniFlexFitness/OmniTask/issues/193) — "Project pages waste vertical screen space".

## Problem

Inside a project (`/projects/:id`) a tall stack of chrome bands, each with its own
vertical padding, sits on top of the content. On **Tasks -> Board** at 1366x768 the
columns start near the vertical midpoint and cards are clipped. The same waste affects
Overview, List, Board, Calendar, and Settings.

Measured chrome stack (top to bottom) before this change, Tasks -> Board:

| # | Band | Spacing | Source |
|---|------|---------|--------|
| 1 | Global navbar | `h-14` (56px) | `core/layout/navbar.component.html` (unchanged) |
| 2 | "Back to Projects" breadcrumb on its own line | `mb-2` | `project-detail.component.html` |
| 3 | Icon (`w-10 h-10`) + title (`text-xl`) + description row | `py-2` | `project-detail.component.html` |
| 4 | Overview/Tasks/Settings tab bar on a separate row | `mt-3`, `py-1.5` | `project-detail.component.html` |
| 5 | `<main>` padding | `p-6` (24px) | `project-detail.component.html` |
| 6 | View-mode toolbar (List/Board/Calendar + Add Task) | `mb-4` | `project-detail.component.html` |
| 7 | Per-view filter bar (count/select/filters) | `px-4 py-2` | `task-board-view` / `task-list-view` |

~294px of chrome + padding above the first card on a 768px-tall viewport (~38%).

## Scope

Presentation only. No changes to data models, Firestore rules, services, component
TypeScript logic, or behavior. Pure layout/CSS (Tailwind utility) edits in the templates,
plus the plan doc. Brand language (cyan/violet/emerald accents, top glow line,
`omni-glitch-btn`, `ofx-neon-button`) is preserved.

## UX design (the densified layout)

1. **Collapse the project header into a single row.** Move the back control inline as an
   icon-only chevron (with `aria-label`/`title`), shrink the icon `10->9` and title
   `text-xl -> text-lg`, and place the Overview/Tasks/Settings tabs on the *same* row,
   right-aligned, wrapping below on narrow screens. This removes two stacked rows
   (the standalone back line and the separate tab row) and their `mb-2`/`mt-3` gaps.
2. **Drop the header description line.** It is already `line-clamp-1` and is shown in full
   on the Overview tab's "About this project" card. Preserve discoverability via a `title`
   tooltip on the project name. Biggest single vertical win.
3. **Reduce `<main>` vertical padding** `p-6 -> px-4 sm:px-6 py-4`. Benefits all three tabs.
4. **Tighten the Tasks view-mode toolbar** margin `mb-4 -> mb-3`.
5. **Tighten per-view bands:** board/list filter bars `py-2 -> py-1.5`; calendar header
   `p-4 -> px-4 py-2.5`.
6. **Lightly tighten Overview** section rhythm `space-y-8 -> space-y-6` so the same
   densification reads consistently on the scrolling tab.

Net: ~90px reclaimed on the Board view (~2 additional card rows visible), header height
roughly halved (~120px -> ~55px), and content begins within the ~120-150px target of the
content-area top on all sub-pages.

Design was produced directly in the real Angular components (the app's own Tailwind + neon
utility system is the design surface) rather than as a throwaway static mock, so what ships
is exactly what was designed. The claude.ai/design (DesignSync) product targets reusable
design-system component libraries, which is a different workflow than densifying these
existing feature pages.

## Files affected

- `docs/plans/densify-project-page-layout.md` (this file)
- `src/app/features/projects/project-detail.component.html` — header collapse, main padding,
  tasks-tab toolbar margin, overview spacing
- `src/app/features/tasks/task-board-view.component.html` — filter bar padding
- `src/app/features/tasks/task-list-view.component.html` — filter bar padding
- `src/app/features/tasks/task-calendar-view.component.html` — calendar header padding

## Implementation steps

1. Rewrite the `project-detail` `<header>` into one compact `flex flex-wrap` row: inline
   back chevron, `w-9 h-9` icon, `text-lg` title + archived badge (with `title` tooltip),
   and the three tabs right-aligned. Drop the description paragraph.
2. Reduce `<main>` padding to `px-4 sm:px-6 py-4`.
3. Change the Tasks tab controls row `mb-4 -> mb-3` and tighten Overview `space-y-8 -> space-y-6`.
4. Tighten board/list filter bars and the calendar header padding.

## Test plan

- `ng build --configuration production`
- `ng test --watch=false --browsers=ChromeHeadless`
- `ng lint`
- Manual (reviewer): open a project with many tasks and confirm at 1366x768, 1920x1080, and
  ~768px width that Overview/Tasks(List/Board/Calendar)/Settings content starts higher, more
  Board cards are visible per column, tabs remain usable, and there are no double scrollbars.

## Acceptance criteria (from #193)

- >= ~2.5 Board cards visible per column at 1366x768 without scrolling.
- Content begins within ~120-150px of the content-area top on all sub-pages.
- No clipped content / no double scrollbars at 1366x768, 1920x1080, ~768px.
- Brand styling preserved. No raw exceptions; errors still via `ToastService`.
- Pre-done checklist passes.

## Rollback

Revert the single layout commit; templates return to prior markup. No migrations, no data
or schema changes, so rollback is immediate and risk-free.
