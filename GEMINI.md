# Gemini.md - Project Map & Source of Truth

> **Status:** PRODUCTION  
> **Phase:** Maintenance & Feature Development  
> **Last Updated:** 2026-01-21  
> **Project:** OmniTask - Task Management Application

---

## Project Overview

| Field | Value |
|-------|-------|
| North Star | Modern task management app with Asana free-tier feature parity |
| Domain | OmniFlex brand ecosystem |
| Architecture | **SPA**: Angular 21 frontend + Firebase backend |
| UI Framework | **Angular 21** (standalone components, signals, inject()) |
| Styling | TailwindCSS 3 with custom dark theme |
| Backend | Firebase (Firestore, Authentication, Functions) |
| Deployment | Docker + Nginx on Google Cloud Run |
| CI/CD | GitHub Actions |
| Design System | Dark mode, glassmorphism, cyberpunk-inspired aesthetic |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         OmniTask Application                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Angular 21 SPA Frontend                       │   │
│  │  (Dashboard | Projects | Tasks | Calendar | Settings)            │   │
│  └────────────────────────────────┬────────────────────────────────┘   │
│                                   │                                     │
│                          Firebase SDK                                   │
│                                   │                                     │
│  ┌────────────────────────────────┴────────────────────────────────┐   │
│  │                      Firebase Backend                            │   │
│  └───────┬──────────────────┬───────────────────┬──────────────────┘   │
│          │                  │                   │                      │
│  ┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐              │
│  │   Firestore   │  │     Auth      │  │   Functions   │              │
│  │  • Projects   │  │ • Email/Pass  │  │ • Triggers    │              │
│  │  • Tasks      │  │ • Google SSO  │  │ • Scheduled   │              │
│  │  • Users      │  │ • Session     │  │ • API routes  │              │
│  │  • Comments   │  │   Management  │  │               │              │
│  └───────────────┘  └───────────────┘  └───────────────┘              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Deployment:
  - Production: Google Cloud Run (Docker + Nginx)
  - CI/CD: GitHub Actions (build, test, deploy)
  - Firebase Hosting: Static assets + Functions
```

---

## Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Primary Purple** | `#8b5cf6` | Primary actions, CTAs, buttons |
| **Secondary Blue** | `#3b82f6` | Secondary actions, links, info states |
| **Accent Cyan** | `#06b6d4` | Glows, highlights, hover accents |
| **Background** | `#0f0f0f` - `#1a1a1a` | Dark mode backgrounds |
| **Surface** | `rgba(255,255,255,0.05)` | Glassmorphism panels |

---

## Behavioral Rules (Detailed)

### Enforced Rules
- **Standalone Components**: All components must use `standalone: true`
- **Signal-First State**: Use signals (`signal()`, `computed()`) over BehaviorSubject
- **Inject Pattern**: Use `inject()` for DI, not constructor injection
- **OnPush Detection**: Default to OnPush change detection strategy
- **Service Layer**: Firestore calls only in services, never in components
- **Error Boundaries**: try-catch with user-friendly messages, log to console

### Do Not Rules
- **No `any` Type**: Use `unknown` if type is uncertain
- **No Constructor DI**: Always use `inject()`
- **No Silent Failures**: Always handle and log errors
- **No Raw Errors to Users**: Display user-friendly messages only
- **No NgModules**: Use standalone components exclusively
- **No Old Firebase API**: Use modular Firestore API only

### User Roles
- **Owner**: Full project access, can delete projects
- **Admin**: Can manage members, edit settings
- **Member**: Can create/edit tasks, view project
- **Viewer**: Read-only access

---

## File Structure

```
src/app/
├── core/                    # Singleton services, guards, interceptors
│   ├── models/              # TypeScript interfaces
│   ├── services/            # Firebase services, auth, theme
│   └── guards/              # Route guards
├── features/                # Feature modules
│   ├── dashboard/           # Main dashboard view
│   ├── projects/            # Project management
│   ├── tasks/               # Task CRUD, detail views
│   ├── calendar/            # Calendar integration
│   └── settings/            # User preferences
└── shared/                  # Reusable components
    └── components/          # Buttons, modals, inputs
```

---

## Integration Status

| Service | Type | Configuration | Status |
|---------|------|---------------|--------|
| Firebase Auth | Authentication | Email/Password + Google | **ACTIVE** |
| Firestore | Database | Production rules | **ACTIVE** |
| Firebase Functions | Backend | Node.js 18 | **ACTIVE** |
| Google Cloud Run | Deployment | Docker + Nginx | **ACTIVE** |
| GitHub Actions | CI/CD | Build + Deploy | **ACTIVE** |
| Google Tasks API | Sync | OAuth 2.0 | **IN PROGRESS** |

---

## Data Schema

### Project
```typescript
interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  ownerId: string;
  members: ProjectMember[];
  settings: ProjectSettings;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Task
```typescript
interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate: Timestamp | null;
  assigneeId: string | null;
  tags: string[];
  subtasks: Subtask[];
  parentTaskId: string | null;
  order: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### User
```typescript
interface User {
  id: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  preferences: UserPreferences;
  createdAt: Timestamp;
}
```

---

## Firestore Collections

| Collection | Purpose | Indexes |
|------------|---------|---------|
| `users` | User profiles and preferences | email |
| `projects` | Project metadata | ownerId, members |
| `tasks` | Task data | projectId, status, assigneeId, dueDate |
| `comments` | Task comments | taskId, createdAt |
| `activity` | Audit log | projectId, createdAt |

---

## AI-Assisted PR Review Behavior

### Trigger Keywords

| Trigger | Action |
|---------|--------|
| `@implement` | Implement ALL non-skipped review comments |
| `@implement @comment-{id}` | Implement a specific comment by GitHub ID |
| `@implement --only=gemini` | Only implement Gemini's comments |
| `@implement --only=codex` | Only implement Codex/Copilot's comments |

### Comment Selection Markers

| Marker | Meaning |
|--------|---------|
| `[skip]` | Do NOT implement this comment |
| `[include]` | Explicitly include this comment |
| `[critical]` | High priority - implement first |
| `[optional]` | Nice-to-have, implement if time allows |

---

## Available Workflows

| Workflow | Command | Purpose |
|----------|---------|---------|
| Angular Component | `/angular-component` | Generate new component with conventions |
| Debug Build | `/debug-build` | Fix build failures in CI/CD or local |
| Feature Branch | `/feature-branch` | Create properly named feature branch |
| PR Feedback | `/pr-feedback` | Process and implement PR review comments |
| Seed Data | `/seed-data` | Populate Firebase with test data |

---

## Services Registry

| Service | File | Purpose |
|---------|------|---------|
| `AuthService` | `core/services/auth.service.ts` | Authentication, session management |
| `ProjectService` | `core/services/project.service.ts` | Project CRUD operations |
| `TaskService` | `core/services/task.service.ts` | Task CRUD, ordering, filtering |
| `ThemeService` | `core/services/theme.service.ts` | Dark mode, theme preferences |
| `ToastService` | `core/services/toast.service.ts` | User notifications |

---

## Key Components

| Component | Path | Purpose |
|-----------|------|---------|
| `DashboardComponent` | `features/dashboard/` | Main overview view |
| `ProjectListComponent` | `features/projects/` | Project cards grid |
| `TaskListViewComponent` | `features/tasks/` | Kanban/list task view |
| `TaskDetailModalComponent` | `features/tasks/` | Task editing modal |
| `ProjectFormModalComponent` | `features/projects/` | Project create/edit |

---

## Context Handoff Log

| Timestamp | Change | Next Step |
|-----------|--------|-----------|
| 2025-12-31 | Project initialized with Angular 21 + Firebase | Build core features |
| 2026-01-02 | Dashboard and auth complete | Implement task management |
| 2026-01-04 | Task CRUD with drag-and-drop | Add project management |
| 2026-01-06 | Projects feature complete | Google Tasks integration |
| 2026-01-11 | Input UX improvements (autocomplete, tags) | AI workflow automation |
| 2026-01-20 | AI agent workflows created | Continue feature development |
| 2026-01-21 | GEMINI.md restructured | Ongoing maintenance |

---

## Maintenance Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-15 | PR review workflow implemented | Auto-implements feedback |
| 2026-01-20 | Build error fixes | Date constructor type issues |
| 2026-01-20 | Google Tasks sync in progress | OAuth integration pending |

---

## Quick Reference

### Start Development
```bash
npm install
ng serve
# http://localhost:4200
```

### Build for Production
```bash
ng build --configuration production
```

### Deploy to Cloud Run
```bash
# Triggered automatically by GitHub Actions on push to `live` branch
git push origin live
```

### Firebase Emulators
```bash
firebase emulators:start
```
