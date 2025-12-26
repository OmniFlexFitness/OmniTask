import { Timestamp } from '@angular/fire/firestore';

type FirestoreDate = Timestamp | Date;

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
  assigneeName?: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate?: FirestoreDate;
  tags?: string[];
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
  googleTaskId?: string;
}
