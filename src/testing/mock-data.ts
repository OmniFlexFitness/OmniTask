import { Timestamp } from '@angular/fire/firestore';
import {
  Project,
  Task,
  Tag,
  CustomFieldDefinition,
  Section,
} from '../app/core/models/domain.model';
import { UserProfile } from '../app/core/models/user.model';

export function createMockTimestamp(date = new Date()): Timestamp {
  return Timestamp.fromDate(date);
}

export function generateMockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'mock-project-123',
    name: 'Sample Cyberpunk Project',
    description: 'A neon-lit test project',
    color: '#8b5cf6',
    ownerId: 'user-123',
    memberIds: ['user-123', 'user-456'],
    sections: [
      { id: 'sec-1', name: 'To Do', order: 0, status: 'todo' },
      { id: 'sec-2', name: 'In Progress', order: 1, status: 'in-progress' },
      { id: 'sec-3', name: 'Done', order: 2, status: 'done' },
    ],
    tags: [
      { id: 'tag-1', name: 'Bug', color: '#ef4444' },
      { id: 'tag-2', name: 'Feature', color: '#10b981' },
    ],
    createdAt: createMockTimestamp(),
    status: 'active',
    ...overrides,
  };
}

export function generateMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'mock-task-123',
    projectId: 'mock-project-123',
    sectionId: 'sec-1',
    title: 'Hack the mainframe',
    description: 'Need to bypass Ice security',
    status: 'todo',
    priority: 'high',
    order: 1000,
    assigneeIds: ['user-123'],
    assigneeNames: ['Neon Strider'],
    createdAt: createMockTimestamp(),
    updatedAt: createMockTimestamp(),
    createdById: 'user-123',
    ...overrides,
  };
}

export function generateMockUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: 'user-123',
    email: 'hacker@omniflex.net',
    displayName: 'Neon Strider',
    domain: 'omniflex.net',
    role: 'admin',
    createdAt: new Date(),
    lastLoginAt: new Date(),
    ...overrides,
  };
}
