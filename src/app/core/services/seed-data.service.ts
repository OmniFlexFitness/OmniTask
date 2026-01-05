import { Injectable, inject } from '@angular/core';
import { Firestore, collection, addDoc, getDocs, query, where, writeBatch, doc } from '@angular/fire/firestore';
import { AuthService } from '../auth/auth.service';
import { Task, Project, Section, Subtask } from '../models/domain.model';

/**
 * Sample data seeder for OmniFlex-themed projects and tasks
 */
@Injectable({
  providedIn: 'root'
})
export class SeedDataService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  /**
   * Check if user has any projects, if not, seed sample data
   */
  async seedIfEmpty(): Promise<boolean> {
    const user = this.auth.currentUserSig();
    if (!user) return false;

    const projectsRef = collection(this.firestore, 'projects');
    const q = query(projectsRef, where('memberIds', 'array-contains', user.uid));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      await this.seedSampleData();
      return true;
    }
    return false;
  }

  /**
   * Seed sample OmniFlex-themed projects and tasks
   */
  async seedSampleData(): Promise<void> {
    const user = this.auth.currentUserSig();
    if (!user) throw new Error('Must be authenticated to seed data');

    const projectsRef = collection(this.firestore, 'projects');
    const tasksRef = collection(this.firestore, 'tasks');
    const batch = writeBatch(this.firestore);

    // ==========================================
    // PROJECT 1: OmniFlex Product Launch
    // ==========================================
    const project1Sections: Section[] = [
      { id: crypto.randomUUID(), name: 'Backlog', order: 0, color: '#6366f1' },
      { id: crypto.randomUUID(), name: 'In Progress', order: 1, color: '#0ea5e9' },
      { id: crypto.randomUUID(), name: 'Review', order: 2, color: '#f59e0b' },
      { id: crypto.randomUUID(), name: 'Done', order: 3, color: '#10b981' }
    ];

    const project1Ref = doc(projectsRef);
    const project1: Omit<Project, 'id'> = {
      name: 'Zenith Pre-Workout Launch',
      description: 'Marketing and product launch campaign for Zenith - our flagship high-stim pre-workout supplement',
      color: '#00d2ff',
      ownerId: user.uid,
      memberIds: [user.uid],
      sections: project1Sections,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active'
    };
    batch.set(project1Ref, project1);

    // Tasks for Project 1
    const p1Tasks: Omit<Task, 'id'>[] = [
      {
        projectId: project1Ref.id,
        sectionId: project1Sections[1].id, // In Progress
        title: 'Design product packaging mockups',
        description: 'Create 3D renders of the Zenith pre-workout tub with cyberpunk aesthetic. Include neon accents and dark theme.',
        status: 'in-progress',
        priority: 'high',
        order: 0,
        assigneeName: 'Alex Chen',
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        tags: ['design', 'packaging'],
        subtasks: [
          { id: crypto.randomUUID(), title: 'Draft initial concept sketches', completed: true },
          { id: crypto.randomUUID(), title: 'Create 3D model in Blender', completed: false },
          { id: crypto.randomUUID(), title: 'Apply textures and materials', completed: false },
          { id: crypto.randomUUID(), title: 'Render final images', completed: false }
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: user.uid
      },
      {
        projectId: project1Ref.id,
        sectionId: project1Sections[0].id, // Backlog
        title: 'Write social media launch content',
        description: 'Create Instagram, TikTok, and Twitter posts for the Zenith launch week. Include product benefits and energy-focused messaging.',
        status: 'todo',
        priority: 'medium',
        order: 1,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        tags: ['marketing', 'social-media'],
        subtasks: [
          { id: crypto.randomUUID(), title: 'Write Instagram captions (5 posts)', completed: false },
          { id: crypto.randomUUID(), title: 'Create TikTok video scripts', completed: false },
          { id: crypto.randomUUID(), title: 'Design carousel graphics', completed: false }
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: user.uid
      },
      {
        projectId: project1Ref.id,
        sectionId: project1Sections[2].id, // Review
        title: 'Finalize ingredient transparency page',
        description: 'Complete the interactive ingredient breakdown page showing all Zenith components, dosages, and scientific backing.',
        status: 'in-progress',
        priority: 'high',
        order: 0,
        assigneeName: 'Dr. Sarah Kim',
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        tags: ['website', 'content'],
        subtasks: [
          { id: crypto.randomUUID(), title: 'Add caffeine dosage details', completed: true },
          { id: crypto.randomUUID(), title: 'Include L-Citrulline research links', completed: true },
          { id: crypto.randomUUID(), title: 'Final legal review', completed: false }
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: user.uid
      },
      {
        projectId: project1Ref.id,
        sectionId: project1Sections[3].id, // Done
        title: 'Set up e-commerce product page',
        description: 'Configure Shopify product listing with all variants, pricing, and inventory tracking.',
        status: 'done',
        priority: 'high',
        order: 0,
        completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        tags: ['e-commerce'],
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
        createdById: user.uid
      }
    ];

    for (const task of p1Tasks) {
      const taskRef = doc(tasksRef);
      batch.set(taskRef, { ...task, projectId: project1Ref.id });
    }

    // ==========================================
    // PROJECT 2: OmniTask Development
    // ==========================================
    const project2Sections: Section[] = [
      { id: crypto.randomUUID(), name: 'To Do', order: 0, color: '#8b5cf6' },
      { id: crypto.randomUUID(), name: 'In Progress', order: 1, color: '#ec4899' },
      { id: crypto.randomUUID(), name: 'Done', order: 2, color: '#10b981' }
    ];

    const project2Ref = doc(projectsRef);
    const project2: Omit<Project, 'id'> = {
      name: 'OmniTask App Development',
      description: 'Internal development of the OmniTask project management application for the OmniFlex ecosystem',
      color: '#8b5cf6',
      ownerId: user.uid,
      memberIds: [user.uid],
      sections: project2Sections,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active'
    };
    batch.set(project2Ref, project2);

    // Tasks for Project 2
    const p2Tasks: Omit<Task, 'id'>[] = [
      {
        projectId: project2Ref.id,
        sectionId: project2Sections[1].id,
        title: 'Implement drag-to-create subtask feature',
        description: 'Allow users to drag a task onto another task to convert it into a subtask',
        status: 'in-progress',
        priority: 'high',
        order: 0,
        assigneeName: 'Dev Team',
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        tags: ['feature', 'ux'],
        subtasks: [
          { id: crypto.randomUUID(), title: 'Update TaskService with convertToSubtask method', completed: false },
          { id: crypto.randomUUID(), title: 'Add drop detection to List View', completed: false },
          { id: crypto.randomUUID(), title: 'Add drop detection to Board View', completed: false },
          { id: crypto.randomUUID(), title: 'Visual feedback during drag', completed: false }
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: user.uid
      },
      {
        projectId: project2Ref.id,
        sectionId: project2Sections[0].id,
        title: 'Add calendar sync with Google Calendar',
        description: 'Integrate with Google Calendar API to sync task due dates',
        status: 'todo',
        priority: 'medium',
        order: 1,
        tags: ['integration', 'feature'],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: user.uid
      },
      {
        projectId: project2Ref.id,
        sectionId: project2Sections[2].id,
        title: 'Fix task creation modal error',
        description: 'Resolved syncPendingControls error in reactive forms',
        status: 'done',
        priority: 'high',
        order: 0,
        completedAt: new Date(),
        tags: ['bug-fix'],
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
        createdById: user.uid
      }
    ];

    for (const task of p2Tasks) {
      const taskRef = doc(tasksRef);
      batch.set(taskRef, { ...task, projectId: project2Ref.id });
    }

    // ==========================================
    // PROJECT 3: Fitness Content Calendar
    // ==========================================
    const project3Sections: Section[] = [
      { id: crypto.randomUUID(), name: 'Ideas', order: 0, color: '#f59e0b' },
      { id: crypto.randomUUID(), name: 'Scripting', order: 1, color: '#06b6d4' },
      { id: crypto.randomUUID(), name: 'Filming', order: 2, color: '#ec4899' },
      { id: crypto.randomUUID(), name: 'Editing', order: 3, color: '#8b5cf6' },
      { id: crypto.randomUUID(), name: 'Published', order: 4, color: '#10b981' }
    ];

    const project3Ref = doc(projectsRef);
    const project3: Omit<Project, 'id'> = {
      name: 'Fitness Content Calendar',
      description: 'Weekly workout videos, nutrition tips, and supplement education content for YouTube and social media',
      color: '#ec4899',
      ownerId: user.uid,
      memberIds: [user.uid],
      sections: project3Sections,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active'
    };
    batch.set(project3Ref, project3);

    // Tasks for Project 3
    const p3Tasks: Omit<Task, 'id'>[] = [
      {
        projectId: project3Ref.id,
        sectionId: project3Sections[2].id, // Filming
        title: 'Film "5 Pre-Workout Mistakes" video',
        description: 'Educational content about common pre-workout timing and dosing errors. Feature Zenith as the example product.',
        status: 'in-progress',
        priority: 'high',
        order: 0,
        assigneeName: 'Content Team',
        dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        tags: ['video', 'youtube', 'education'],
        subtasks: [
          { id: crypto.randomUUID(), title: 'Set up gym lighting', completed: true },
          { id: crypto.randomUUID(), title: 'Record intro segment', completed: true },
          { id: crypto.randomUUID(), title: 'Film mistake demonstrations', completed: false },
          { id: crypto.randomUUID(), title: 'Record outro with CTA', completed: false }
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: user.uid
      },
      {
        projectId: project3Ref.id,
        sectionId: project3Sections[0].id, // Ideas
        title: 'Athlete testimonial series',
        description: 'Weekly short-form content featuring OmniFlex sponsored athletes sharing their workout routines',
        status: 'todo',
        priority: 'low',
        order: 0,
        tags: ['series', 'testimonial'],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: user.uid
      },
      {
        projectId: project3Ref.id,
        sectionId: project3Sections[4].id, // Published
        title: 'Zenith unboxing & first taste review',
        description: 'Completed unboxing video showing packaging design and flavor test',
        status: 'done',
        priority: 'medium',
        order: 0,
        completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        tags: ['video', 'product'],
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
        createdById: user.uid
      }
    ];

    for (const task of p3Tasks) {
      const taskRef = doc(tasksRef);
      batch.set(taskRef, { ...task, projectId: project3Ref.id });
    }

    // Commit all data
    await batch.commit();
    console.log('✅ Sample data seeded successfully!');
  }
}
