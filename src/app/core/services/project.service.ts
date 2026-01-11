import { Injectable, inject, signal } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  collectionData,
  DocumentReference,
} from '@angular/fire/firestore';
import { 
  Project, 
  Section, 
  DEFAULT_SECTIONS, 
  CustomFieldDefinition, 
  Tag 
} from '../models/domain.model';
import { AuthService } from '../auth/auth.service';
import { Observable, switchMap, of, map } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  private projectsCollection = collection(this.firestore, 'projects');

  // Loading state for UI feedback
  loading = signal(false);
  error = signal<string | null>(null);

  // Currently selected project
  selectedProjectId = signal<string | null>(null);

  /**
   * Get all projects for the current user
   */
  getMyProjects(): Observable<Project[]> {
    return this.auth.user$.pipe(
      switchMap((user) => {
        if (!user) return of([]);
        // Query projects where user is owner or member
        const q = query(this.projectsCollection, where('memberIds', 'array-contains', user.uid));
        return collectionData(q, { idField: 'id' }) as Observable<Project[]>;
      }),
      map((projects) => projects.sort((a, b) => a.name.localeCompare(b.name)))
    );
  }

  /**
   * Get a single project by ID
   */
  async getProject(id: string): Promise<Project | null> {
    try {
      const docRef = doc(this.firestore, `projects/${id}`);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as Project;
    } catch (err) {
      console.error('Failed to fetch project:', err);
      return null;
    }
  }

  /**
   * Get project as observable (for real-time updates)
   */
  getProject$(id: string): Observable<Project | null> {
    const docRef = doc(this.firestore, `projects/${id}`);
    return collectionData(
      query(collection(this.firestore, 'projects'), where('__name__', '==', id)),
      { idField: 'id' }
    ).pipe(map((docs) => (docs[0] as Project) || null));
  }

  /**
   * Create a new project with default sections
   */
  async createProject(
    name: string,
    description: string = '',
    color: string = '#6366f1'
  ): Promise<DocumentReference> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const user = this.auth.currentUserSig();
      if (!user) throw new Error('Not authenticated');

      // Create default sections with unique IDs
      const sections: Section[] = DEFAULT_SECTIONS.map((s, i) => ({
        ...s,
        id: crypto.randomUUID(),
      }));

      const project: Omit<Project, 'id'> = {
        name,
        description,
        color,
        ownerId: user.uid,
        memberIds: [user.uid],
        sections,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'active',
      };

      const result = await addDoc(this.projectsCollection, project);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create project';
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Update a project
   */
  async updateProject(id: string, data: Partial<Project>): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const docRef = doc(this.firestore, `projects/${id}`);
      await updateDoc(docRef, { ...data, updatedAt: new Date() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update project';
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Delete a project (and optionally its tasks)
   */
  async deleteProject(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const docRef = doc(this.firestore, `projects/${id}`);
      await deleteDoc(docRef);
      // Note: Tasks should be deleted separately or via Cloud Function
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete project';
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Archive a project
   */
  async archiveProject(id: string): Promise<void> {
    return this.updateProject(id, { status: 'archived' });
  }

  /**
   * Restore an archived project
   */
  async restoreProject(id: string): Promise<void> {
    return this.updateProject(id, { status: 'active' });
  }

  /**
   * Add a section to a project
   */
  async addSection(projectId: string, name: string, color?: string): Promise<Section> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const newSection: Section = {
      id: crypto.randomUUID(),
      name,
      order: project.sections.length,
      color,
    };

    const updatedSections = [...project.sections, newSection];
    await this.updateProject(projectId, { sections: updatedSections });

    return newSection;
  }

  /**
   * Update a section
   */
  async updateSection(projectId: string, sectionId: string, data: Partial<Section>): Promise<void> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const updatedSections = project.sections.map((s) =>
      s.id === sectionId ? { ...s, ...data } : s
    );

    await this.updateProject(projectId, { sections: updatedSections });
  }

  /**
   * Remove a section from a project
   */
  async removeSection(projectId: string, sectionId: string): Promise<void> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const updatedSections = project.sections
      .filter((s) => s.id !== sectionId)
      .map((s, i) => ({ ...s, order: i })); // Re-index orders

    await this.updateProject(projectId, { sections: updatedSections });
  }

  /**
   * Reorder sections
   */
  async reorderSections(projectId: string, sections: Section[]): Promise<void> {
    await this.updateProject(projectId, { sections });
  }

  /**
   * Add a member to a project
   */
  async addMember(projectId: string, userId: string): Promise<void> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    if (!project.memberIds.includes(userId)) {
      const updatedMemberIds = [...project.memberIds, userId];
      await this.updateProject(projectId, { memberIds: updatedMemberIds });
    }
  }

  /**
   * Remove a member from a project
   */
  async removeMember(projectId: string, userId: string): Promise<void> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    // Prevent removing the owner
    if (project.ownerId === userId) {
      throw new Error('Cannot remove project owner');
    }

    const updatedMemberIds = project.memberIds.filter((id) => id !== userId);
    await this.updateProject(projectId, { memberIds: updatedMemberIds });
  }

  /**
   * Add a custom field definition to a project
   */
  async addCustomField(
    projectId: string,
    field: Omit<CustomFieldDefinition, 'id' | 'projectId'>
  ): Promise<CustomFieldDefinition> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const newField: CustomFieldDefinition = {
      ...field,
      id: crypto.randomUUID(),
      projectId,
    };

    const updatedFields = [...(project.customFields || []), newField];
    await this.updateProject(projectId, { customFields: updatedFields });

    return newField;
  }

  /**
   * Update a custom field definition
   */
  async updateCustomField(
    projectId: string,
    fieldId: string,
    data: Partial<CustomFieldDefinition>
  ): Promise<void> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const updatedFields = (project.customFields || []).map((f) =>
      f.id === fieldId ? { ...f, ...data } : f
    );

    await this.updateProject(projectId, { customFields: updatedFields });
  }

  /**
   * Remove a custom field definition from a project
   */
  async removeCustomField(projectId: string, fieldId: string): Promise<void> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const updatedFields = (project.customFields || []).filter((f) => f.id !== fieldId);

    await this.updateProject(projectId, { customFields: updatedFields });
  }

  /**
   * Add a tag to a project
   */
  async addTag(
    projectId: string,
    tag: Omit<Tag, 'id'>
  ): Promise<Tag> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    // Validate tag name
    const trimmedName = tag.name.trim();
    if (!trimmedName) throw new Error('Tag name cannot be empty');

    // Check if tag with name already exists
    const existing = project.tags?.find((t) => t.name.toLowerCase() === trimmedName.toLowerCase());
    if (existing) return existing;

    const newTag: Tag = {
      ...tag,
      name: trimmedName,
      id: crypto.randomUUID(),
    };

    const updatedTags = [...(project.tags || []), newTag];
    await this.updateProject(projectId, { tags: updatedTags });

    return newTag;
  }

  /**
   * Remove a tag from a project
   */
  async removeTag(projectId: string, tagId: string): Promise<void> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const updatedTags = (project.tags || []).filter((t) => t.id !== tagId);
    await this.updateProject(projectId, { tags: updatedTags });
  }
}
