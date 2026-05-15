# Task Point Values — Implementation Plan

## Scope

Add a per-project, configurable "point value" system so every task can carry an
effort rating. Six scale types are supported; three of them support optional
PERT (Optimistic / Most Likely / Pessimistic) inputs that compute a weighted
estimate and standard deviation. The configuration lives on the `Project`
document; the value lives on each `Task` document.

## Files affected

1. `src/app/core/models/domain.model.ts` — add types and interfaces for scale
   configs and per-task values, extend `Project` and `Task`.
2. `src/app/core/utils/point-scale.utils.ts` (new) — value generation, PERT
   computation, aggregation, validation, migration helpers.
3. `src/app/core/utils/point-scale.utils.spec.ts` (new) — unit tests.
4. `src/app/features/projects/components/point-scale-manager.component.{ts,html,css}` (new) —
   project-settings UI: choose a scale, configure it, preset templates,
   PERT toggle.
5. `src/app/features/projects/components/project-settings-panel.component.html` —
   wire the new manager into the settings panel.
6. `src/app/features/projects/components/project-settings-panel.component.ts` —
   import the new manager.
7. `src/app/features/tasks/components/task-point-value-input.component.{ts,html,css}` (new) —
   per-task input that adapts to the scale and PERT toggle.
8. `src/app/features/tasks/task-create-modal.component.ts` + html — wire the
   input into task creation.
9. `src/app/features/tasks/task-detail-modal.component.ts` + html — wire the
   input into task editing.
10. `src/app/features/tasks/task-list-view.component.html` — display the point
    value as a badge in the list.
11. `src/app/core/services/project.service.ts` — `updatePointScaleConfig`
    helper that triggers nearest-equivalent migration of existing task values.

## Implementation steps

### 1. Types and utilities
- `PointScaleId` discriminator + per-scale config interface
  (`NumericScaleConfig`, `TimeScaleConfig`, `TShirtScaleConfig`,
  `AnimalScaleConfig`, `MultiFactorScaleConfig`, `CreditHoursScaleConfig`).
- `PointValue` discriminated union covering single values, PERT triples,
  T-shirt / animal labels, and multi-factor maps.
- Utilities:
  - `getAllowedValues(config)` — for numeric / time-preset / credit-hours-bucket.
  - `computePertEstimate({ o, m, p })` — (O + 4M + P)/6.
  - `computePertStdDev({ o, m, p })` — (P − O)/6.
  - `pointValueScalar(value, config)` — projection of any value to a number
    for aggregation.
  - `aggregateValues(values, config)` — totals, PERT roll-up with total SD.
  - `formatPointValue(value, config)` — string for display.
  - `migrateValue(value, fromConfig, toConfig)` — nearest-equivalent mapping
    used when the project changes its scale.

### 2. Project config storage
- Extend `Project` with `pointScaleConfig?: PointScaleConfig`. Absent =
  feature off for that project.
- `ProjectService.updatePointScaleConfig(projectId, newConfig)`: read all
  tasks, map their values via `migrateValue`, write the new config + the
  per-task value migrations. Batch updates.

### 3. Project settings UI
- New component `<app-point-scale-manager>` rendered in
  `project-settings-panel`.
- Scale-type selector with cards (one per scale). Selecting a scale shows a
  template / preset picker (numeric) or shows the scale-specific config form
  (time, multi-factor, credit-hours).
- For numeric and time-unit scales: PERT toggle.
- "Save" persists via `updatePointScaleConfig`. Confirm before changing
  scale type when tasks already have values.

### 4. Task input UI
- New component `<app-task-point-value-input>` accepts the project's
  `pointScaleConfig` and a current `PointValue` and emits changes.
- Renders different controls:
  - Numeric / time / credit_hours non-PERT → single select or numeric input.
  - PERT mode → three controls (O / M / P) with the same allowed values.
  - T-Shirt → segmented control of size labels.
  - Animal → segmented control of animal labels with icons.
  - Multi-Factor → one input per configured factor.
- Shows the computed score / weighted average underneath.

### 5. Wire into modals
- Add input + form-control binding in `task-create-modal` and
  `task-detail-modal`. Store on `Task.pointValue`.
- Project-level aggregation in `project-detail` header (left to a follow-up
  if time-bound; the manager already exposes the helpers).

### 6. Display
- In `task-list-view`, show a compact badge next to priority. Use
  `formatPointValue` for the label.

## Test plan
- Unit tests for value generation (`linear`, `fibonacci`, `powers_of_two`),
  PERT math, aggregation, migration of single-value tasks to PERT and vice
  versa.
- Smoke: open a project, enable a numeric scale, set a value on a task,
  switch to T-Shirt — confirm values map to nearest, no console errors.

## Rollback
- Field is optional on `Project` and `Task`; clearing `pointScaleConfig`
  hides the feature without affecting other data.
- Old documents without the new fields render exactly as before.
