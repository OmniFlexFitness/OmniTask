# Firebase & Firestore Context

This document provides Firebase-specific patterns and conventions for OmniTask.

## Collection Structure

```
firestore/
├── users/
│   └── {userId}/
│       ├── profile data
│       └── preferences
├── projects/
│   └── {projectId}/
│       ├── project data
│       ├── sections[]
│       └── tags[]
└── tasks/
    └── {taskId}/
        ├── task data
        └── subtasks[]
```

## Document Schemas

### User Document

```typescript
// Collection: users/{userId}
interface UserDocument {
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  preferences: {
    defaultView: 'list' | 'board' | 'calendar';
    theme: 'dark' | 'light';
  };
}
```

### Project Document

```typescript
// Collection: projects/{projectId}
interface ProjectDocument {
  name: string;
  description?: string;
  color?: string;           // Hex color for project
  ownerId: string;          // User who created it
  memberIds: string[];      // Users with access
  status: 'active' | 'archived';
  
  // Embedded arrays (not subcollections)
  sections: Section[];
  tags: Tag[];
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Task Document

```typescript
// Collection: tasks/{taskId}
interface TaskDocument {
  projectId: string;        // Reference to parent project
  sectionId?: string;       // Section within project
  title: string;
  description?: string;
  assignedToId?: string;    // Reference to user
  status: string;
  priority: string;
  order: number;
  dueDate?: Timestamp;
  tags?: string[];          // Array of tag IDs
  subtasks?: Subtask[];     // Embedded array
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## Firestore Patterns

### Reading Data with Real-Time Updates

```typescript
import { 
  Firestore, 
  collection, 
  query, 
  where, 
  orderBy,
  collectionData 
} from '@angular/fire/firestore';

// Get all tasks for a project
const tasksQuery = query(
  collection(this.firestore, 'tasks'),
  where('projectId', '==', projectId),
  orderBy('order', 'asc')
);

// Returns Observable with real-time updates
collectionData(tasksQuery, { idField: 'id' }) as Observable<Task[]>;
```

### Creating Documents

```typescript
import { addDoc, collection, serverTimestamp } from '@angular/fire/firestore';

async createTask(task: Omit<Task, 'id'>): Promise<string> {
  const docRef = await addDoc(
    collection(this.firestore, 'tasks'),
    {
      ...task,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
  return docRef.id;
}
```

### Updating Documents

```typescript
import { doc, updateDoc, serverTimestamp } from '@angular/fire/firestore';

async updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
  await updateDoc(
    doc(this.firestore, `tasks/${taskId}`),
    {
      ...updates,
      updatedAt: serverTimestamp(),
    }
  );
}
```

### Deleting Documents

```typescript
import { doc, deleteDoc } from '@angular/fire/firestore';

async deleteTask(taskId: string): Promise<void> {
  await deleteDoc(doc(this.firestore, `tasks/${taskId}`));
}
```

### Batch Operations

Use batches for atomic multi-document updates:

```typescript
import { writeBatch, doc } from '@angular/fire/firestore';

async reorderTasks(tasks: { id: string; order: number }[]): Promise<void> {
  const batch = writeBatch(this.firestore);
  
  for (const task of tasks) {
    batch.update(
      doc(this.firestore, `tasks/${task.id}`),
      { order: task.order, updatedAt: serverTimestamp() }
    );
  }
  
  await batch.commit();  // Atomic operation
}
```

### Transactions

Use transactions for read-then-write operations:

```typescript
import { runTransaction, doc } from '@angular/fire/firestore';

async incrementTaskCount(projectId: string): Promise<void> {
  await runTransaction(this.firestore, async (transaction) => {
    const projectRef = doc(this.firestore, `projects/${projectId}`);
    const projectSnap = await transaction.get(projectRef);
    const currentCount = projectSnap.data()?.taskCount || 0;
    transaction.update(projectRef, { taskCount: currentCount + 1 });
  });
}
```

## Timestamp Handling

### Firestore Timestamp vs JavaScript Date

```typescript
import { Timestamp } from '@angular/fire/firestore';

// Type for fields that can be either
type FirestoreDate = Timestamp | Date;

// Converting Timestamp to Date
function toDate(value: FirestoreDate): Date {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  return value;
}

// Safe Date constructor usage
const date = timestamp?.toDate ? new Date(timestamp.toDate()) : new Date(timestamp);
```

## Security Rules Patterns

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users can only access their own profile
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Projects - owner and members can access
    match /projects/{projectId} {
      allow read: if request.auth != null && 
        (resource.data.ownerId == request.auth.uid || 
         request.auth.uid in resource.data.memberIds);
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && 
        resource.data.ownerId == request.auth.uid;
    }
    
    // Tasks - must be member of parent project
    match /tasks/{taskId} {
      allow read, write: if request.auth != null && 
        exists(/databases/$(database)/documents/projects/$(resource.data.projectId)) &&
        (get(/databases/$(database)/documents/projects/$(resource.data.projectId)).data.ownerId == request.auth.uid ||
         request.auth.uid in get(/databases/$(database)/documents/projects/$(resource.data.projectId)).data.memberIds);
    }
  }
}
```

## Indexing

Compound indexes needed for common queries:

```json
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "tasks",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "projectId", "order": "ASCENDING" },
        { "fieldPath": "order", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "tasks",
      "queryScope": "COLLECTION", 
      "fields": [
        { "fieldPath": "projectId", "order": "ASCENDING" },
        { "fieldPath": "sectionId", "order": "ASCENDING" },
        { "fieldPath": "order", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "tasks",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "assignedToId", "order": "ASCENDING" },
        { "fieldPath": "dueDate", "order": "ASCENDING" }
      ]
    }
  ]
}
```

## Firebase Authentication

### Current User Pattern

```typescript
import { Auth, authState, User } from '@angular/fire/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  
  currentUser = signal<User | null>(null);
  
  constructor() {
    authState(this.auth)
      .pipe(takeUntilDestroyed())
      .subscribe(user => this.currentUser.set(user));
  }
  
  get userId(): string | null {
    return this.currentUser()?.uid ?? null;
  }
}
```

### Auth Guards

```typescript
import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { map } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  return authState(auth).pipe(
    map(user => !!user || ['/login'])
  );
};
```
