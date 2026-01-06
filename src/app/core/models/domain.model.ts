import { Timestamp } from '@angular/fire/firestore';

type FirestoreDate = Timestamp | Date;

/**
 * Section within a project for organizing tasks (Kanban columns)
 */
export interface Section {
  id: string;
  name: string;
  order: number;
  color?: string; // For visual distinction
}

/**
 * Subtask for breaking down larger tasks
 */
export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string; // Project accent color for UI
  icon?: string; // Project icon name
  ownerId: string;
  memberIds: string[];
  sections: Section[]; // Kanban columns
  createdAt: FirestoreDate;
  updatedAt?: FirestoreDate;
  status: 'active' | 'archived';
  googleTaskListId?: string;
}

export interface Task {
  id: string;
  projectId: string;
  sectionId?: string; // For board view positioning
  title: string;
  description: string; // Markdown
  assignedToId?: string;
  assigneeName?: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  order: number; // Position in list/section for drag-and-drop
  dueDate?: FirestoreDate;
  completedAt?: FirestoreDate; // When task was marked done
  tags?: string[];
  subtasks?: Subtask[];
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
  createdById?: string; // Who created the task
  googleTaskId?: string;
  isGoogleTask?: boolean;
}

/**
 * Default sections for new projects
 */
export const DEFAULT_SECTIONS: Omit<Section, 'id'>[] = [
  { name: 'To Do', order: 0, color: '#6366f1' },
  { name: 'In Progress', order: 1, color: '#0ea5e9' },
  { name: 'Done', order: 2, color: '#10b981' }
];

/**
 * View mode for task display
 */
export type TaskViewMode = 'list' | 'board' | 'calendar';
