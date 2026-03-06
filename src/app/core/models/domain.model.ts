import { Timestamp } from '@angular/fire/firestore';

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

export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string; // Project accent color for UI
  icon?: string; // Project icon name
  coverImage?: string; // Project cover image URL (Firebase Storage)
  ownerId: string;
  memberIds: string[];
  sections: Section[]; // Kanban columns
  customFieldIds?: string[]; // References to global CustomFieldDefinitions
  tags?: Tag[]; // Defined tags for this project
  createdAt: FirestoreDate;
  updatedAt?: FirestoreDate;
  status: 'active' | 'archived';
  // Google Tasks sync fields
  googleTaskListId?: string;
  syncEnabled?: boolean; // Whether sync is active for this project
  lastSyncAt?: FirestoreDate; // Last successful sync timestamp
  syncStatus?: 'synced' | 'pending' | 'error'; // Current sync status
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
  dueDate?: FirestoreDate;
  completedAt?: FirestoreDate | null; // When task was marked done (null = cleared)
  tags?: string[];
  subtasks?: Subtask[];
  customFieldValues?: Record<string, any>;
  attachments?: string[]; // Image/file URLs (Firebase Storage)
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
  createdById?: string; // Who created the task
  googleTaskId?: string;
  googleTaskListId?: string; // Stored for efficient sync operations
  isGoogleTask?: boolean;
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
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

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
export type TaskViewMode = 'list' | 'board' | 'calendar';
