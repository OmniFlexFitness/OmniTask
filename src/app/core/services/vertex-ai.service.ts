import { Injectable, inject, signal } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Subtask } from '../models/domain.model';

/**
 * Response types for Vertex AI functions
 */
export interface GenerateSubtasksResponse {
  subtasks: Subtask[];
  success: boolean;
}

export interface SuggestPriorityResponse {
  priority: 'low' | 'medium' | 'high';
  reasoning: string;
  success: boolean;
}

export interface SuggestDueDateResponse {
  dueDate: string;
  estimatedDays: number;
  reasoning: string;
  success: boolean;
}

export interface EnhanceDescriptionResponse {
  enhancedDescription: string;
  additions: string;
  success: boolean;
}

/**
 * VertexAiService - Angular service for AI-powered task features
 *
 * Provides access to Vertex AI (Gemini) via Firebase callable functions:
 * - Generate subtasks from task title/description
 * - Suggest task priority based on context
 * - Suggest due dates based on complexity
 * - Enhance task descriptions with detail
 */
@Injectable({
  providedIn: 'root',
})
export class VertexAiService {
  private readonly functions = inject(Functions);

  // Loading states for each operation
  readonly generatingSubtasks = signal(false);
  readonly suggestingPriority = signal(false);
  readonly suggestingDueDate = signal(false);
  readonly enhancingDescription = signal(false);

  // General loading state (any AI operation in progress)
  readonly loading = signal(false);

  // Error state
  readonly error = signal<string | null>(null);

  /**
   * Generate subtasks from a task title and description
   * Uses Gemini to break down complex tasks into actionable subtasks
   */
  async generateSubtasks(
    taskTitle: string,
    taskDescription?: string,
    projectContext?: string,
  ): Promise<Subtask[]> {
    this.generatingSubtasks.set(true);
    this.loading.set(true);
    this.error.set(null);

    try {
      const generateSubtasksFn = httpsCallable<
        { taskTitle: string; taskDescription?: string; projectContext?: string },
        GenerateSubtasksResponse
      >(this.functions, 'generateSubtasks');

      const result = await generateSubtasksFn({ taskTitle, taskDescription, projectContext });
      return result.data.subtasks;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate subtasks';
      this.error.set(errorMessage);
      console.error('generateSubtasks error:', err);
      throw err;
    } finally {
      this.generatingSubtasks.set(false);
      this.loading.set(false);
    }
  }

  /**
   * Suggest priority based on task title and description
   * Returns low, medium, or high with reasoning
   */
  async suggestPriority(
    taskTitle: string,
    taskDescription?: string,
    dueDate?: string,
  ): Promise<{ priority: 'low' | 'medium' | 'high'; reasoning: string }> {
    this.suggestingPriority.set(true);
    this.loading.set(true);
    this.error.set(null);

    try {
      const suggestPriorityFn = httpsCallable<
        { taskTitle: string; taskDescription?: string; dueDate?: string },
        SuggestPriorityResponse
      >(this.functions, 'suggestTaskPriority');

      const result = await suggestPriorityFn({ taskTitle, taskDescription, dueDate });
      return { priority: result.data.priority, reasoning: result.data.reasoning };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to suggest priority';
      this.error.set(errorMessage);
      console.error('suggestPriority error:', err);
      throw err;
    } finally {
      this.suggestingPriority.set(false);
      this.loading.set(false);
    }
  }

  /**
   * Suggest due date based on task complexity
   * Returns suggested date with reasoning
   */
  async suggestDueDate(
    taskTitle: string,
    taskDescription?: string,
    projectDeadline?: string,
  ): Promise<{ dueDate: string; estimatedDays: number; reasoning: string }> {
    this.suggestingDueDate.set(true);
    this.loading.set(true);
    this.error.set(null);

    try {
      const suggestDueDateFn = httpsCallable<
        { taskTitle: string; taskDescription?: string; projectDeadline?: string },
        SuggestDueDateResponse
      >(this.functions, 'suggestDueDate');

      const result = await suggestDueDateFn({ taskTitle, taskDescription, projectDeadline });
      return {
        dueDate: result.data.dueDate,
        estimatedDays: result.data.estimatedDays,
        reasoning: result.data.reasoning,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to suggest due date';
      this.error.set(errorMessage);
      console.error('suggestDueDate error:', err);
      throw err;
    } finally {
      this.suggestingDueDate.set(false);
      this.loading.set(false);
    }
  }

  /**
   * Enhance task description with more detail
   * Returns improved description with structure and clarity
   */
  async enhanceDescription(
    taskTitle: string,
    taskDescription: string,
    projectContext?: string,
  ): Promise<{ enhancedDescription: string; additions: string }> {
    this.enhancingDescription.set(true);
    this.loading.set(true);
    this.error.set(null);

    try {
      const enhanceDescriptionFn = httpsCallable<
        { taskTitle: string; taskDescription: string; projectContext?: string },
        EnhanceDescriptionResponse
      >(this.functions, 'enhanceTaskDescription');

      const result = await enhanceDescriptionFn({ taskTitle, taskDescription, projectContext });
      return {
        enhancedDescription: result.data.enhancedDescription,
        additions: result.data.additions,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to enhance description';
      this.error.set(errorMessage);
      console.error('enhanceDescription error:', err);
      throw err;
    } finally {
      this.enhancingDescription.set(false);
      this.loading.set(false);
    }
  }
}
