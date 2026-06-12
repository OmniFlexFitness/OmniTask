import { Timestamp } from '@angular/fire/firestore';
import type { AutomationRule } from './automation.model';

type FirestoreDate = Timestamp | Date;

export type CustomFieldType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'dropdown'
  | 'multi-select'
  | 'checkbox'
  | 'url'
  | 'status'
  | 'user';

export interface CustomFieldOption {
  id: string;
  label: string;
  color?: string;
}

export interface CustomFieldDefinition {
  id: string;
  userId: string; // Belongs to a user's global library
  name: string;
  type: CustomFieldType;
  options?: CustomFieldOption[]; // For dropdown/status/multi-select
  currencySymbol?: string; // e.g. '$', '€'
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

/**
 * Section within a project for organizing tasks (Kanban columns)
 */
export interface Section {
  id: string;
  name: string;
  order: number;
  color?: string; // For visual distinction
  /** The task status this section represents. Used to auto-sync status ↔ sectionId. */
  status?: Task['status'];
  description?: string;
  wipLimit?: number | null;
}

/**
 * Subtask for breaking down larger tasks
 */
export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  description?: string; // Markdown
  assigneeIds?: string[]; // Multiple assignees for subtasks
  assigneeNames?: string[]; // Display names corresponding to assigneeIds
}

export interface Tag {
  id: string;
  name: string;
  color: string; // Hex color code
}

/**
 * Per-project, admin-managed customization for the project dashboard
 * (Overview pane). Lets owners/admins decide which widgets are shown,
 * change the visual style of certain indicators, and override the colors
 * used by progress gradients and metric breakdowns.
 *
 * All fields are optional: the dashboard falls back to the default cyber
 * palette and the full widget set when a project hasn't been customized.
 */
export interface DashboardPreferences {
  /**
   * Keys of dashboard widgets to render. When omitted, all widgets are
   * shown. The supported keys are kept stable for forward compatibility.
   */
  visibleWidgets?: DashboardWidgetKey[];

  /** Color stops used for the Completion progress gradient (left → right). */
  completionGradient?: string[];

  /** Override colors for the status breakdown (donut/bars). */
  statusColors?: {
    todo?: string;
    inProgress?: string;
    done?: string;
  };

  /** Override colors for the priority distribution bars. */
  priorityColors?: {
    low?: string;
    medium?: string;
    high?: string;
  };

  /** Visual style for the Status Breakdown widget. */
  statusDisplay?: 'donut' | 'bars';
}

export type DashboardWidgetKey =
  | 'status'
  | 'completion'
  | 'priority'
  | 'sections'
  | 'tags'
  | 'upcoming'
  | 'activity'
  | 'assignees';

export const ALL_DASHBOARD_WIDGETS: { key: DashboardWidgetKey; label: string }[] = [
  { key: 'status', label: 'Status Breakdown' },
  { key: 'completion', label: 'Completion' },
  { key: 'priority', label: 'Priority Distribution' },
  { key: 'sections', label: 'Sections' },
  { key: 'tags', label: 'Tags in use' },
  { key: 'upcoming', label: 'Upcoming deadlines' },
  { key: 'activity', label: 'Recent activity' },
  { key: 'assignees', label: 'Top assignees' },
];

/**
 * Default values consumed by the project dashboard when no per-project
 * `dashboardPreferences` overrides are set. Centralized so the manager UI
 * and the rendering surface stay in sync — change here, change everywhere.
 */
export const DEFAULT_COMPLETION_GRADIENT: readonly string[] = [
  '#00d2ff',
  '#e040fb',
  '#ff1493',
];

export const DEFAULT_DASHBOARD_STATUS_COLORS = {
  todo: '#e040fb',
  inProgress: '#00d2ff',
  done: '#6b7280',
} as const;

export const DEFAULT_DASHBOARD_PRIORITY_COLORS = {
  high: '#ff1493',
  medium: '#e040fb',
  low: '#00d2ff',
} as const;

export const DEFAULT_DASHBOARD_STATUS_DISPLAY: NonNullable<
  DashboardPreferences['statusDisplay']
> = 'donut';

export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string; // Project accent color for UI
  icon?: string; // Project icon name
  coverImage?: string; // Project cover image URL (Firebase Storage)
  ownerId: string;
  memberIds: string[];
  /**
   * Members granted elevated "project admin" rights for this project: they can
   * manage members and edit project settings without being the owner. Always a
   * subset of `memberIds`. The owner is implicitly an admin and is never listed
   * here. Absent on projects created before per-project admins existed.
   */
  adminIds?: string[];
  sections: Section[]; // Kanban columns
  customFieldIds?: string[]; // References to global CustomFieldDefinitions
  tags?: Tag[]; // Defined tags for this project
  /** Admin-managed dashboard customization (widgets, colors, display style). */
  dashboardPreferences?: DashboardPreferences;
  /**
   * Per-project task-effort scale. When absent, the point-value UI is hidden
   * for this project. See `PointScaleConfig` for the discriminated union.
   */
  pointScaleConfig?: PointScaleConfig;
  createdAt: FirestoreDate;
  updatedAt?: FirestoreDate;
  status: 'active' | 'archived';
  // Google Tasks sync fields
  googleTaskListId?: string;
  syncEnabled?: boolean; // Whether sync is active for this project
  lastSyncAt?: FirestoreDate; // Last successful sync timestamp
  syncStatus?: 'synced' | 'pending' | 'error'; // Current sync status
  // Google Sheets sync fields (independent of Google Tasks sync)
  googleSheetId?: string; // Spreadsheet ID
  googleSheetName?: string; // Spreadsheet display name (cached for UI)
  googleSheetTabName?: string; // Tab/sheet name within the spreadsheet (e.g. "Tasks")
  sheetSyncEnabled?: boolean;
  lastSheetSyncAt?: FirestoreDate;
  sheetSyncStatus?: 'synced' | 'pending' | 'error';
  /** Client-evaluated automation rules for this project. */
  automationRules?: AutomationRule[];
}

/**
 * A user's role within a single project. `owner` outranks `admin`, which
 * outranks `member`. `null` means the user is not part of the project at all.
 */
export type ProjectRole = 'owner' | 'admin' | 'member';

/** Fields needed to determine a user's role in a project. */
type ProjectRoleSource = Pick<Project, 'ownerId' | 'memberIds' | 'adminIds'>;

/**
 * Resolve a user's role within a project. Owner takes precedence over an
 * admin grant, which takes precedence over plain membership. Returns `null`
 * for users who are neither owner, admin, nor member.
 */
export function getProjectRole(
  project: ProjectRoleSource,
  uid: string | null | undefined,
): ProjectRole | null {
  if (!uid) return null;
  if (project.ownerId === uid) return 'owner';
  if (project.adminIds?.includes(uid)) return 'admin';
  if (project.memberIds?.includes(uid)) return 'member';
  return null;
}

/**
 * True when the user can manage a project (owner or project admin): manage
 * members and edit project settings. Owner-only actions (delete, transfer,
 * change the admin roster) are checked separately against `getProjectRole`.
 */
export function isProjectManager(
  project: ProjectRoleSource,
  uid: string | null | undefined,
): boolean {
  const role = getProjectRole(project, uid);
  return role === 'owner' || role === 'admin';
}

export interface Task {
  id: string;
  projectId: string;
  sectionId?: string; // For board view positioning
  title: string;
  description: string; // Markdown
  /** @deprecated Use assigneeIds instead. Kept for backward compatibility. */
  assignedToId?: string;
  /** @deprecated Use assigneeNames instead. Kept for backward compatibility. */
  assigneeName?: string;
  assigneeIds?: string[]; // Multiple assignees
  assigneeNames?: string[]; // Display names corresponding to assigneeIds
  notifyAssignees?: boolean; // Whether to send email notifications on assignment/status changes
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  order: number; // Position in list/section for drag-and-drop
  startDate?: FirestoreDate; // Start date for timeline/gantt views
  dueDate?: FirestoreDate;
  completedAt?: FirestoreDate | null; // When task was marked done (null = cleared)
  tags?: string[];
  /** @deprecated Subtasks are now independent Task documents linked via parentId. */
  subtasks?: Subtask[];
  parentId?: string | null; // Indicates this task is a subtask of another task
  blockingIds?: string[]; // IDs of tasks this task blocks
  blockedByIds?: string[]; // IDs of tasks that block this task from being completed
  customFieldValues?: Record<string, any>;
  /**
   * Per-task effort estimate. Shape is determined by the project's active
   * `pointScaleConfig` (numeric, PERT triple, T-shirt, animal, or per-factor
   * map). Cleared automatically when migration cannot map a value.
   */
  pointValue?: PointValue;
  attachments?: string[]; // Image/file URLs (Firebase Storage)
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
  createdById?: string; // Who created the task
  googleTaskId?: string;
  googleTaskListId?: string; // Stored for efficient sync operations
  isGoogleTask?: boolean;
  // Google Sheets sync fields
  googleSheetId?: string; // Spreadsheet this task is mirrored in
  googleSheetRowId?: string; // Stable ID written to the sheet row (task.id by default)
  isGoogleSheetTask?: boolean; // True if the task originated from a Google Sheet
  /**
   * Last row OmniTask believes it wrote to the linked sheet for this task.
   * Used to support field-level merge when the sheet and app both changed
   * different columns within the same polling window.
   */
  sheetLastSyncedRow?: string[];
  sheetLastSyncedAt?: FirestoreDate;
}

/**
 * A task that recurs every day at a specific time.
 * Stored in users/{uid}/recurringTasks subcollection.
 */
export interface RecurringTask {
  id: string;
  userId: string;
  title: string;
  description?: string;
  /** Scheduled time in HH:mm (24-hour) format */
  time: string;
  /** Whether this recurring task is currently active */
  enabled: boolean;
  color?: string;
  /** Array of minute offsets for reminders (e.g., [0, 15] for at time and 15 mins before) */
  reminders?: number[];
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

/**
 * A time-block on the weekly schedule.
 * Stored in users/{uid}/weeklyBlocks subcollection.
 */
export interface WeeklyBlock {
  id: string;
  userId: string;
  title: string;
  description?: string;
  /** 0 = Sunday, 1 = Monday, … 6 = Saturday */
  dayOfWeek: number;
  /** Start time in HH:mm (24-hour) format */
  startTime: string;
  /** End time in HH:mm (24-hour) format */
  endTime: string;
  color?: string;
  /** true = repeats every week; false = one-time only */
  repeating: boolean;
  /** ISO date string (YYYY-MM-DD) of the Monday of the target week (for one-time blocks) */
  weekDate?: string;
  /** Array of minute offsets for reminders (e.g., [0, 15] for at time and 15 mins before) */
  reminders?: number[];
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

/**
 * Cyberpunk-friendly palette used to deterministically color user avatars
 * (assignees, members) across the app. Picking by hash keeps the same user
 * the same hue wherever they appear.
 */
export const ASSIGNEE_PALETTE = [
  '#00d2ff',
  '#e040fb',
  '#ff1493',
  '#a564ff',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#0ea5e9',
] as const;

/**
 * Curated color palette for schedule items
 */
export const SCHEDULE_COLORS = [
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#ec4899', // Pink
  '#6366f1', // Indigo
] as const;

export const AVAILABLE_REMINDERS = [
  { value: 0, label: 'At time of event' },
  { value: 5, label: '5 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
];

/**
 * Cyberpunk theme color constants
 */
export const CYBERPUNK_COLORS = {
  TODO: '#e040fb', // Cyber purple
  IN_PROGRESS: '#00d2ff', // Cyber blue
  DONE: '#6b7280', // Muted gray for dormant
} as const;

/**
 * Default sections for new projects - Cyberpunk theme colors
 */
export const DEFAULT_SECTIONS: Omit<Section, 'id'>[] = [
  { name: 'To Do', order: 0, color: CYBERPUNK_COLORS.TODO, status: 'todo' },
  { name: 'In Progress', order: 1, color: CYBERPUNK_COLORS.IN_PROGRESS, status: 'in-progress' },
  { name: 'Done', order: 2, color: CYBERPUNK_COLORS.DONE, status: 'done' },
];

/**
 * View mode for task display
 */
export type TaskViewMode = 'overview' | 'list' | 'board' | 'calendar' | 'timeline';

// ---------------------------------------------------------------------------
// Task Point Values
// ---------------------------------------------------------------------------

export type PointScaleId =
  | 'numeric_configurable'
  | 'time_unit'
  | 'tshirt'
  | 'animal'
  | 'custom_multi_factor'
  | 'credit_hours';

export type NumericIncrementType = 'linear' | 'fibonacci' | 'powers_of_two' | 'custom';

export interface NumericScaleConfig {
  scale: 'numeric_configurable';
  min_value: number;
  max_value: number;
  increment_type: NumericIncrementType;
  increment_step?: number;
  custom_values?: number[];
  allow_zero?: boolean;
  pert_mode_enabled?: boolean;
}

export type TimeUnit = 'minutes' | 'hours' | 'days' | 'weeks';

export interface TimeScaleConfig {
  scale: 'time_unit';
  unit: TimeUnit;
  decimal_precision?: number;
  input_mode: 'freeform' | 'preset';
  preset_values?: number[];
  load_factor?: number;
  pert_mode_enabled?: boolean;
}

export type TShirtSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
export const TSHIRT_SIZES: readonly TShirtSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
export const DEFAULT_TSHIRT_MAPPING: Readonly<Record<TShirtSize, number>> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 5,
  XL: 8,
  XXL: 13,
};

export interface TShirtScaleConfig {
  scale: 'tshirt';
  mapping?: Record<TShirtSize, number>;
}

export type AnimalSize = 'Mouse' | 'Cat' | 'Dog' | 'Horse' | 'Elephant' | 'Whale';
export const ANIMAL_SIZES: readonly AnimalSize[] = [
  'Mouse',
  'Cat',
  'Dog',
  'Horse',
  'Elephant',
  'Whale',
];
export const DEFAULT_ANIMAL_MAPPING: Readonly<Record<AnimalSize, number>> = {
  Mouse: 1,
  Cat: 2,
  Dog: 3,
  Horse: 5,
  Elephant: 8,
  Whale: 13,
};
export const ANIMAL_ICONS: Readonly<Record<AnimalSize, string>> = {
  Mouse: '🐭',
  Cat: '🐱',
  Dog: '🐶',
  Horse: '🐴',
  Elephant: '🐘',
  Whale: '🐋',
};

export interface AnimalScaleConfig {
  scale: 'animal';
  mapping?: Record<AnimalSize, number>;
}

export interface MultiFactor {
  id: string;
  name: string;
  scale: number[];
  weight: number;
}

export interface MultiFactorScaleConfig {
  scale: 'custom_multi_factor';
  factors: MultiFactor[];
  formula: 'sum' | 'product' | 'weighted_sum';
}

export type CreditHoursInputMode = 'direct' | 'bucket' | 'fibonacci';
export const CREDIT_HOURS_BUCKETS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8];
export const CREDIT_HOURS_FIB: readonly number[] = [0.5, 1, 2, 3, 5, 8, 13];

export interface CreditHoursScaleConfig {
  scale: 'credit_hours';
  total_credit_hours: number;
  total_work_hours: number;
  start_date?: FirestoreDate;
  end_date?: FirestoreDate;
  weekly_target_hours?: number;
  input_mode: CreditHoursInputMode;
  /**
   * Optional inclusive lower bound applied to the bucket / fibonacci value
   * lists. When omitted, the full default list is offered. Ignored when
   * `input_mode` is `direct` since direct entry has no fixed value set.
   */
  min_value?: number;
  /**
   * Optional inclusive upper bound. See `min_value` for semantics.
   */
  max_value?: number;
  pert_mode_enabled?: boolean;
}

export type PointScaleConfig =
  | NumericScaleConfig
  | TimeScaleConfig
  | TShirtScaleConfig
  | AnimalScaleConfig
  | MultiFactorScaleConfig
  | CreditHoursScaleConfig;

export type PointValue =
  | { type: 'numeric'; value: number }
  | { type: 'numeric_pert'; optimistic: number; mostLikely: number; pessimistic: number }
  | { type: 'tshirt'; value: TShirtSize }
  | { type: 'animal'; value: AnimalSize }
  | { type: 'multi_factor'; values: Record<string, number> };

/** Built-in preset templates for the Configurable Numeric scale. */
export interface NumericPreset {
  id: string;
  label: string;
  config: Omit<NumericScaleConfig, 'pert_mode_enabled'>;
}

export const NUMERIC_PRESETS: readonly NumericPreset[] = [
  {
    id: 'linear_1_5',
    label: 'Linear 1-5',
    config: {
      scale: 'numeric_configurable',
      min_value: 1,
      max_value: 5,
      increment_type: 'linear',
      increment_step: 1,
    },
  },
  {
    id: 'linear_1_10',
    label: 'Linear 1-10',
    config: {
      scale: 'numeric_configurable',
      min_value: 1,
      max_value: 10,
      increment_type: 'linear',
      increment_step: 1,
    },
  },
  {
    id: 'fibonacci',
    label: 'Fibonacci',
    config: {
      scale: 'numeric_configurable',
      min_value: 1,
      max_value: 100,
      increment_type: 'fibonacci',
    },
  },
  {
    id: 'modified_fibonacci',
    label: 'Modified Fibonacci',
    config: {
      scale: 'numeric_configurable',
      min_value: 0,
      max_value: 100,
      increment_type: 'custom',
      custom_values: [0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100],
      allow_zero: true,
    },
  },
  {
    id: 'powers_of_two',
    label: 'Powers of 2',
    config: {
      scale: 'numeric_configurable',
      min_value: 1,
      max_value: 64,
      increment_type: 'powers_of_two',
    },
  },
  {
    id: 'bucket',
    label: 'Bucket',
    config: {
      scale: 'numeric_configurable',
      min_value: 1,
      max_value: 100,
      increment_type: 'custom',
      custom_values: [1, 2, 3, 5, 8, 13, 20, 40, 100],
    },
  },
] as const;
