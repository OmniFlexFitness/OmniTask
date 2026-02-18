import { Timestamp } from '@angular/fire/firestore';

type FirestoreDate = Timestamp | Date;

export type CustomFieldType = 'text' | 'number' | 'date' | 'dropdown' | 'status' | 'user';

export interface CustomFieldOption {
  id: string;
  label: string;
  color?: string;
}

export interface CustomFieldDefinition {
  id: string;
  name: string;
  type: CustomFieldType;
  options?: CustomFieldOption[]; // For dropdown/status
  projectId: string;
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
  customFields?: CustomFieldDefinition[];
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
