import { Timestamp } from '@angular/fire/firestore';

type FirestoreDate = Timestamp | Date;

export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: FirestoreDate;
}

export interface TaskActivityEntry {
  id: string;
  taskId: string;
  actorId: string;
  actorName: string;
  message: string;
  createdAt: FirestoreDate;
}
