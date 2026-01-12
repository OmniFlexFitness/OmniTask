# GitHub Copilot Instructions for OmniTask

This document provides context and guidelines for GitHub Copilot to generate consistent, high-quality code suggestions for the OmniTask project.

## Project Overview

**OmniTask** is a modern task management application built with Angular 21 and Firebase. It provides features similar to Asana's free tier, including:

- Projects with customizable sections (Kanban boards)
- Tasks with subtasks, tags, priorities, and due dates
- Multiple views: List, Board (Kanban), and Calendar
- Real-time data synchronization via Cloud Firestore

## Technology Stack

### Frontend

- **Angular 21** with standalone components
- **TypeScript 5.9** with strict mode enabled
- **TailwindCSS 3** for styling
- **Angular CDK** for UI primitives (drag-and-drop, overlays)

### Backend

- **Firebase/Firestore** for real-time NoSQL database
- **Firebase Authentication** for user identity
- **Firebase Functions** (if needed for server-side logic)

### Deployment

- **Docker + Nginx** container served via **Google Cloud Run**
- **Firebase Hosting** for static assets
- **Cloudflare** for CDN, DNS, and edge security
- **GitHub Actions** for CI/CD

## Project Structure

```
src/app/
├── app.component.ts       # Root component
├── app.config.ts          # Providers and Firebase config
├── app.routes.ts          # Route definitions
├── core/                  # Core application logic
│   ├── auth/              # Authentication service and guards
│   ├── layout/            # Navbar and layout components
│   ├── models/            # TypeScript interfaces (Task, Project, Section, etc.)
│   ├── services/          # Firebase/Firestore services
│   └── theme/             # Theming and visual effects
├── features/              # Feature modules
│   ├── dashboard/         # Dashboard view
│   ├── projects/          # Project management
│   └── tasks/             # Task views (list, board, calendar, modals)
└── shared/                # Shared/reusable components
    └── components/        # Common UI components (autocomplete, tags)
```

## Coding Standards

### Angular Component Patterns

Always use **standalone components** with the modern Angular patterns:

```typescript
import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-example',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './example.component.html',
  styleUrl: './example.component.css',
})
export class ExampleComponent {
  // Use inject() for dependency injection
  private readonly myService = inject(MyService);

  // Use signals for reactive state
  items = signal<Item[]>([]);
  loading = signal(false);

  // Use computed for derived state
  itemCount = computed(() => this.items().length);
}
```

### Service Patterns

Services should use the `@Injectable({ providedIn: 'root' })` pattern with Firestore:

```typescript
import { Injectable, inject, signal } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  collectionData,
  orderBy,
} from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class MyService {
  private firestore = inject(Firestore);
  private myCollection = collection(this.firestore, 'myCollection');

  // Expose loading and error states
  loading = signal(false);
  error = signal<string | null>(null);

  getData(): Observable<Item[]> {
    const q = query(this.myCollection, orderBy('createdAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<Item[]>;
  }

  async createItem(item: Omit<Item, 'id'>): Promise<void> {
    this.loading.set(true);
    try {
      await addDoc(this.myCollection, { ...item, createdAt: new Date() });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to create');
      throw err;
    } finally {
      this.loading.set(false);
    }
  }
}
```

### TypeScript Interfaces

Define all data models in `src/app/core/models/`:

```typescript
import { Timestamp } from '@angular/fire/firestore';

type FirestoreDate = Timestamp | Date;

export interface MyModel {
  id: string;
  name: string;
  createdAt: FirestoreDate;
  updatedAt?: FirestoreDate;
}
```

### Styling Guidelines

- Use **TailwindCSS utility classes** for most styling
- Component-specific CSS should go in `.css` files alongside components
- Follow the OmniFlex brand aesthetic: dark mode, purple/blue accents, glassmorphism
- Use semantic color variables when possible

### Imports and Formatting

- Use **single quotes** for strings
- **100 character** line width limit
- Use **Angular's parser** for HTML files (configured in `package.json` prettier)

## Key Domain Models

### Task

```typescript
interface Task {
  id: string;
  projectId: string;
  sectionId?: string; // For board view placement
  title: string;
  description: string; // Markdown supported
  assignedToId?: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  order: number; // For drag-and-drop ordering
  dueDate?: FirestoreDate;
  tags?: string[];
  subtasks?: Subtask[];
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}
```

### Project

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string;
  ownerId: string;
  memberIds: string[];
  sections: Section[]; // Kanban columns
  tags?: Tag[];
  status: 'active' | 'archived';
  createdAt: FirestoreDate;
}
```

### Section (Kanban Column)

```typescript
interface Section {
  id: string;
  name: string;
  order: number;
  color?: string;
}
```

## Common Patterns

### RxJS with Signals

Use `takeUntilDestroyed()` for automatic subscription cleanup:

```typescript
import { inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export class MyComponent {
  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.myService
      .getData()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => this.items.set(data));
  }
}
```

### Firestore Batch Operations

For bulk updates (e.g., reordering tasks after drag-and-drop):

```typescript
import { writeBatch, doc } from '@angular/fire/firestore';

async reorderItems(items: { id: string; order: number }[]) {
  const batch = writeBatch(this.firestore);
  for (const item of items) {
    batch.update(doc(this.firestore, `items/${item.id}`), {
      order: item.order,
      updatedAt: new Date()
    });
  }
  await batch.commit();
}
```

### Modal Dialogs

Use consistent modal patterns with overlay backdrop:

```typescript
@Component({
  selector: 'app-my-modal',
  standalone: true,
  template: `
    <div class="modal-backdrop" (click)="close.emit()"></div>
    <div class="modal-content">
      <!-- Content -->
      <button (click)="close.emit()">Cancel</button>
      <button (click)="handleSubmit()">Save</button>
    </div>
  `,
})
export class MyModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<any>();
}
```

## Firebase/Firestore Guidelines

- Collection names are lowercase plural: `tasks`, `projects`, `users`
- Document IDs are auto-generated by Firestore
- Use `Timestamp` from `@angular/fire/firestore` for dates
- Query with `where()`, `orderBy()`, and use compound indexes
- Use `collectionData()` with `{ idField: 'id' }` to include document ID

## Error Handling Patterns

Follow consistent error handling throughout the application:

### Service-Level Error Handling

```typescript
async performAction(): Promise<void> {
  this.loading.set(true);
  this.error.set(null);

  try {
    await this.someAsyncOperation();
  } catch (err) {
    // Log detailed error for debugging
    console.error('Operation failed:', err);

    // Set user-friendly message
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    this.error.set(message);

    // Re-throw if caller needs to handle
    throw err;
  } finally {
    this.loading.set(false);
  }
}
```

### Component-Level Error Display

```typescript
// Show user-friendly errors via toast/snackbar
try {
  await this.taskService.createTask(task);
  this.showToast('Task created successfully', 'success');
} catch (error) {
  this.showToast('Failed to create task. Please try again.', 'error');
}
```

### Error Handling Rules

- ✅ Always use try-catch with typed error handling
- ✅ Log errors to console in development
- ✅ Display user-friendly error messages (never raw error text)
- ✅ Use signals for error state (`error = signal<string | null>(null)`)
- ❌ Never expose stack traces or internal error details to users
- ❌ Never silently swallow errors without logging

---

## Testing Guidelines

### Test Framework

- **Vitest** for unit and integration tests
- Run tests: `ng test` or `yarn test`
- Test files: `*.spec.ts` alongside source files

### Test Naming Convention

Use descriptive names following this pattern:

```typescript
describe('TaskService', () => {
  it('should create task when valid data is provided', async () => {
    // ...
  });

  it('should throw error when project ID is missing', async () => {
    // ...
  });

  it('should update task order after drag and drop', async () => {
    // ...
  });
});
```

### Service Test Pattern

```typescript
import { TestBed } from '@angular/core/testing';
import { TaskService } from './task.service';
import { vi } from 'vitest';

describe('TaskService', () => {
  let service: TaskService;
  let mockAddDoc: any;

  beforeEach(() => {
    // Mock the addDoc function from Firestore
    mockAddDoc = vi.fn().mockResolvedValue({ id: 'test-id' });

    TestBed.configureTestingModule({
      providers: [
        TaskService,
        { provide: 'addDoc', useValue: mockAddDoc }
      ],
    });

    service = TestBed.inject(TaskService);
  });

  it('should create task with timestamps', async () => {
    // Arrange
    const mockTask = { title: 'Test Task', projectId: 'proj-123' };

    // Act
    await service.createTask(mockTask);

    // Assert
    expect(mockAddDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: 'Test Task',
        createdAt: expect.any(Date),
      })
    );
  });
});
```

### Component Test Pattern

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';

describe('TaskListComponent', () => {
  let component: TaskListComponent;
  let fixture: ComponentFixture<TaskListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskListComponent],
      providers: [{ provide: TaskService, useValue: mockTaskService }],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskListComponent);
    component = fixture.componentInstance;
  });

  it('should display task count', () => {
    component.tasks.set([mockTask1, mockTask2]);
    fixture.detectChanges();

    const countEl = fixture.nativeElement.querySelector('.task-count');
    expect(countEl.textContent).toContain('2 tasks');
  });
});
```

### What to Test

- ✅ Service methods (CRUD operations, data transformations)
- ✅ Component user interactions (clicks, form inputs)
- ✅ Signal/computed value updates
- ✅ Error handling paths
- ✅ Edge cases (empty arrays, null values, boundary conditions)

---

## UI/UX Conventions

### OmniFlex Brand Aesthetic

OmniTask follows the **OmniFlex** brand identity with a premium, futuristic design language:

#### Design Philosophy

| Attribute  | Description                                      |
| ---------- | ------------------------------------------------ |
| **Theme**  | Dark mode by default with high-contrast elements |
| **Style**  | Cyberpunk / Neon Noir / Vaporwave inspired      |
| **Feel**   | Premium, state-of-the-art, futuristic            |
| **Motion** | Smooth, subtle animations that feel alive        |

#### Primary Color Guidelines

> **🎨 Blue and Purple are the primary brand colors. Use them consistently throughout the UI.**

| Usage                  | Color        | Hex Code  |
| ---------------------- | ------------ | --------- |
| **Primary Actions**    | Purple       | `#8b5cf6` |
| **Secondary Actions**  | Blue         | `#3b82f6` |
| **Links & Highlights** | Blue         | `#60a5fa` |
| **Hover States**       | Light Purple | `#a78bfa` |
| **Active/Selected**    | Deep Purple  | `#7c3aed` |
| **Accents & Glows**    | Cyan-Blue    | `#06b6d4` |

**When in doubt, use purple for primary CTAs and blue for secondary/informational elements.**

#### Full Color Palette

```css
/* PRIMARY COLORS - Blue & Purple */
--color-primary: #8b5cf6; /* Main purple - buttons, CTAs */
--color-primary-light: #a78bfa; /* Hover states */
--color-primary-dark: #7c3aed; /* Active/pressed states */

--color-blue: #3b82f6; /* Secondary blue */
--color-blue-light: #60a5fa; /* Links, highlights */
--color-blue-dark: #2563eb; /* Active blue states */

/* Accent - Use for glows and special highlights */
--color-accent: #06b6d4; /* Cyan accent */
--color-accent-glow: #22d3ee; /* Glow effects */

/* Gradient: Purple to Blue (brand signature) */
--gradient-primary: linear-gradient(135deg, #8b5cf6, #3b82f6);
--gradient-accent: linear-gradient(135deg, #8b5cf6, #06b6d4);

/* Background Layers (Dark Mode) */
--bg-base: #0a0a0f; /* Deep dark base */
--bg-surface: #111118; /* Card/panel backgrounds */
--bg-elevated: #1a1a24; /* Modals, dropdowns */
--bg-glass: rgba(255, 255, 255, 0.05); /* Glassmorphism */

/* Text */
--text-primary: #f8fafc;
--text-secondary: #94a3b8;
--text-muted: #64748b;

/* Status Colors */
--color-success: #10b981;
--color-warning: #f59e0b;
--color-error: #ef4444;
```

#### Visual Effects

- **Glassmorphism**: Use frosted glass effect on overlays and cards

  ```css
  .glass-panel {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  ```

- **Glow Effects**: Subtle glows on interactive elements

  ```css
  .btn-primary:hover {
    box-shadow: 0 0 20px rgba(139, 92, 246, 0.4);
  }
  ```

- **Gradients**: Use purple-to-cyan gradients for emphasis
  ```css
  .gradient-accent {
    background: linear-gradient(135deg, #8b5cf6, #06b6d4);
  }
  ```

### Loading States

Always show visual feedback during async operations:

```typescript
loading = signal(false);

async loadData() {
  this.loading.set(true);
  try {
    const data = await this.service.getData();
    this.items.set(data);
  } finally {
    this.loading.set(false);
  }
}
```

```html
@if (loading()) {
<div class="loading-spinner">
  <div class="spinner"></div>
</div>
}
```

### Empty States

Provide helpful, on-brand empty states with calls-to-action:

```html
@if (tasks().length === 0) {
<div class="empty-state glass-panel">
  <div class="empty-icon">📋</div>
  <h3>No tasks yet</h3>
  <p class="text-secondary">Create your first task to get started</p>
  <button class="btn-primary" (click)="openCreateModal()">+ Create Task</button>
</div>
}
```

### Confirmation Dialogs

Require confirmation for destructive actions:

```typescript
async deleteTask(task: Task) {
  const confirmed = await this.showConfirmDialog({
    title: 'Delete Task',
    message: `Are you sure you want to delete "${task.title}"?`,
    confirmText: 'Delete',
    confirmClass: 'btn-danger'
  });

  if (confirmed) {
    await this.taskService.deleteTask(task.id);
  }
}
```

### Micro-Animations

Use subtle animations to make the UI feel responsive:

```css
/* Hover transitions */
.task-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.task-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
}

/* Button press effect */
.btn:active {
  transform: scale(0.98);
}
```

### Responsive Design

- Mobile-first approach
- Breakpoints: `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`
- Collapsible sidebar on mobile
- Touch-friendly tap targets (min 44px)

---

## Git Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/) for clear, semantic history:

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type       | Description                                         |
| ---------- | --------------------------------------------------- |
| `feat`     | New feature or functionality                        |
| `fix`      | Bug fix                                             |
| `docs`     | Documentation only changes                          |
| `style`    | Formatting, no code change (whitespace, semicolons) |
| `refactor` | Code restructuring without changing behavior        |
| `perf`     | Performance improvements                            |
| `test`     | Adding or updating tests                            |
| `chore`    | Maintenance tasks, dependency updates               |
| `ci`       | CI/CD configuration changes                         |

### Scopes (Optional)

Use component or feature names: `tasks`, `projects`, `auth`, `ui`, `api`

### Examples

```bash
feat(tasks): add drag-and-drop reordering in board view

fix(auth): resolve token refresh loop on session expiry

refactor(services): extract shared Firestore logic to base class

chore(deps): update Angular to v21.1.0

docs: update README with deployment instructions
```

### Commit Message Rules

- ✅ Use imperative mood: "add feature" not "added feature"
- ✅ Keep subject line under 72 characters
- ✅ Start description with a lowercase letter (after the type and scope)
- ✅ No period at end of subject line
- ✅ Reference issue numbers in footer: `Closes #123`

---

## Deployment

- The `live` branch auto-deploys to production
- GitHub Actions builds Docker image → pushes to Artifact Registry → deploys to Cloud Run
- Also deploys Firebase Hosting and Firestore rules
- Semantic versioning: MAJOR.MINOR.PATCH (patch auto-increments)

## External API Integration Patterns

When integrating external APIs (OpenAI, Gemini, etc.), follow these patterns:

### Credential Management

> **⚠️ NEVER commit API keys or secrets to the repository.**

| Environment             | Storage Location                      | Recommended      |
| ----------------------- | ------------------------------------- | ---------------- |
| **Production**          | Google Cloud Secret Manager           | ✅ **Preferred** |
| **CI/CD Fallback**      | GitHub Secrets                        | ✅ OK            |
| **Local Development**   | `.env` file (in `.gitignore`)         | ✅ OK            |
| **Firebase Client SDK** | Public config in `app.config.ts`      | ✅ Safe          |
| **Firebase Admin SDK**  | Service account via Workload Identity | ✅ Preferred     |

---

### Google Cloud Secret Manager (Recommended)

GCP Secret Manager provides centralized, secure secret storage with audit logging and fine-grained access control.

#### Creating Secrets via gcloud CLI

```bash
# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com --project=omnitask-475422

# Create a secret
echo -n "your-api-key-here" | gcloud secrets create OPENAI_API_KEY \
  --project=omnitask-475422 \
  --data-file=-

# Create additional secrets
echo -n "your-gemini-key" | gcloud secrets create GEMINI_API_KEY \
  --project=omnitask-475422 \
  --data-file=-
```

#### Granting Access to GitHub Actions

```bash
# Grant the GitHub Actions service account access to secrets
gcloud secrets add-iam-policy-binding OPENAI_API_KEY \
  --project=omnitask-475422 \
  --member="serviceAccount:github-actions@omnitask-475422.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --project=omnitask-475422 \
  --member="serviceAccount:github-actions@omnitask-475422.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### Accessing Secrets in GitHub Actions

```yaml
- name: Authenticate to Google Cloud
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: 'projects/${{ secrets.GCP_PROJECT_NUMBER }}/locations/global/workloadIdentityPools/github-pool/providers/github-provider'
    service_account: 'github-actions@omnitask-475422.iam.gserviceaccount.com'

- name: Set up Cloud SDK
  uses: google-github-actions/setup-gcloud@v2

- name: Access GCP Secrets
  run: |
    OPENAI_KEY=$(gcloud secrets versions access latest --secret="OPENAI_API_KEY")
    echo "::add-mask::$OPENAI_KEY"
    echo "OPENAI_API_KEY=$OPENAI_KEY" >> $GITHUB_ENV
```

#### Updating a Secret

```bash
# Update with new version
echo -n "new-api-key-value" | gcloud secrets versions add OPENAI_API_KEY \
  --project=omnitask-475422 \
  --data-file=-
```

---

### GitHub Secrets (Fallback)

For simpler setups or when GCP Secret Manager is not available:

```yaml
- name: Call AI API
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
  run: |
    # Use environment variables in your build/deploy scripts
```

---

### Creating an AI Service

For AI integrations, create a service in `src/app/core/services/`:

```typescript
// ai.service.ts
import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
@Injectable({ providedIn: 'root' })
export class AIService {
  private functions = inject(Functions);

  // Call a Firebase Function that securely holds the API key
  async generateContent(prompt: string): Promise<string> {
    const generateFn = httpsCallable(this.functions, 'generateAIContent');
    const result = await generateFn({ prompt });
    return result.data as string;
  }
}
```

### Firebase Functions for Secure API Calls

Server-side API keys should be stored in GCP Secret Manager and accessed via Firebase Functions:

```typescript
// functions/src/index.ts
import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/v2/params';

// Reference secrets from GCP Secret Manager
const openaiKey = defineSecret('OPENAI_API_KEY');
const geminiKey = defineSecret('GEMINI_API_KEY');

export const generateAIContent = onCall({ secrets: [openaiKey] }, async (request) => {
  // Access via process.env.OPENAI_API_KEY
  const apiKey = process.env.OPENAI_API_KEY;
  // Make secure API call here
});
```

---

## Pull Request Guidelines

### Updating Existing PRs

> **🚨 IMPORTANT: When suggesting changes during PR reviews, always offer to update the existing PR branch directly.**

**DO NOT** create a new PR based on the current PR branch. This creates confusing nested PRs.

**DO** push commits directly to the PR's source branch to update the existing PR.

### Preferred Workflow

When Copilot suggests changes in a PR review:

1. ✅ **Preferred**: "I'll push these changes to the `feature/my-branch` branch to update this PR."
2. ❌ **Avoid**: "I'll create a new PR with these changes."

### Example Commit Message for PR Updates

```
fix: address review feedback

- Updated component to use signals instead of BehaviorSubject
- Fixed typo in error message
- Added missing null check

Co-authored-by: github-copilot[bot] <...>
```

### Branch Naming Conventions

- Feature branches: `feature/description`
- Bug fixes: `fix/description`
- Hotfixes: `hotfix/description`

---

## Additional Notes

- This is a task management app targeting feature parity with Asana's free tier
- The UI follows "OmniFlex" branding with a dark, premium aesthetic
- Always prefer modern Angular patterns (standalone, signals, inject())
- Keep components focused and reusable
- Use descriptive variable and function names
