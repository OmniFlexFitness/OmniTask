import { Timestamp } from '@angular/fire/firestore';

export interface Project {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  memberIds: string[];
  createdAt: Timestamp;
  status: 'active' | 'archived';
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string; // Markdown
  assignedToId?: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  googleTaskId?: string;
}
