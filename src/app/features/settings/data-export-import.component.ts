import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ProjectService } from '../../core/services/project.service';
import { TaskService } from '../../core/services/task.service';
import {
  ExportImportService,
  ExportFormat,
  ExportOptions,
} from '../../core/services/export-import.service';
import { Project } from '../../core/models/domain.model';

@Component({
  selector: 'app-data-export-import',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './data-export-import.component.html',
})
export class DataExportImportComponent {
  private readonly exportImportService = inject(ExportImportService);
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);

  projects = signal<Project[]>([]);
  loading = signal(false);
  exporting = signal(false);
  importing = signal(false);
  feedback = signal<{ message: string; type: 'success' | 'error' } | null>(null);

  exportFormat = signal<ExportFormat>('csv');
  selectedProjectId = signal<string>('all');
  includeSubtasks = signal(true);
  includeCompleted = signal(true);

  importFile = signal<File | null>(null);
  importProjectId = signal<string>('');
  importPreview = signal<{ count: number; sample: string[] } | null>(null);

  constructor() {
    this.loadProjects();
  }

  private async loadProjects(): Promise<void> {
    this.loading.set(true);
    try {
      const projects = await firstValueFrom(this.projectService.getMyProjects());
      this.projects.set(projects);
      if (projects.length > 0 && !this.importProjectId()) {
        this.importProjectId.set(projects[0].id);
      }
    } catch {
      this.showFeedback('Failed to load projects', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  async onExport(): Promise<void> {
    this.exporting.set(true);
    try {
      const options: ExportOptions = {
        format: this.exportFormat(),
        projectId: this.selectedProjectId(),
        includeSubtasks: this.includeSubtasks(),
        includeCompleted: this.includeCompleted(),
      };

      const { data, filename } = await this.exportImportService.exportTasks(options);
      const mimeType = options.format === 'csv' ? 'text/csv' : 'application/json';
      this.exportImportService.downloadFile(data, filename, mimeType);
      this.showFeedback('Export downloaded successfully', 'success');
    } catch (err) {
      console.error('Export failed:', err);
      this.showFeedback('Export failed. Please try again.', 'error');
    } finally {
      this.exporting.set(false);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const validTypes = ['.csv', '.json'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validTypes.includes(ext)) {
      this.showFeedback('Please select a CSV or JSON file', 'error');
      input.value = '';
      return;
    }

    this.importFile.set(file);
    this.previewImport(file);
  }

  private async previewImport(file: File): Promise<void> {
    const text = await file.text();
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    try {
      if (ext === '.csv') {
        const tasks = this.exportImportService.parseCsvForImport(text);
        this.importPreview.set({
          count: tasks.length,
          sample: tasks.slice(0, 5).map((t) => t.title ?? '(untitled)'),
        });
      } else {
        const { tasks } = this.exportImportService.parseJsonForImport(text);
        this.importPreview.set({
          count: tasks.length,
          sample: tasks.slice(0, 5).map((t) => t.title ?? '(untitled)'),
        });
      }
    } catch {
      this.importPreview.set(null);
      this.showFeedback('Could not parse file. Check the format.', 'error');
    }
  }

  async onImport(): Promise<void> {
    const file = this.importFile();
    const projectId = this.importProjectId();
    if (!file || !projectId) return;

    this.importing.set(true);
    try {
      const text = await file.text();
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

      let tasks: ReturnType<typeof this.exportImportService.parseCsvForImport>;
      if (ext === '.csv') {
        tasks = this.exportImportService.parseCsvForImport(text);
      } else {
        const result = this.exportImportService.parseJsonForImport(text);
        tasks = result.tasks;
      }

      let imported = 0;
      const existingTasks = await this.taskService.getTasksByProjectOnce(projectId);
      const nextOrder = existingTasks.length;

      for (const task of tasks) {
        await this.taskService.createTask({
          title: task.title ?? 'Untitled',
          projectId,
          order: nextOrder + imported,
          description: task.description ?? '',
          status: task.status ?? 'todo',
          priority: task.priority ?? 'medium',
          tags: task.tags ?? [],
        } as Parameters<typeof this.taskService.createTask>[0]);
        imported++;
      }

      this.showFeedback(`Imported ${imported} tasks successfully`, 'success');
      this.importFile.set(null);
      this.importPreview.set(null);
    } catch (err) {
      console.error('Import failed:', err);
      this.showFeedback('Import failed. Please check the file format.', 'error');
    } finally {
      this.importing.set(false);
    }
  }

  clearImport(): void {
    this.importFile.set(null);
    this.importPreview.set(null);
  }

  private showFeedback(message: string, type: 'success' | 'error'): void {
    this.feedback.set({ message, type });
    setTimeout(() => this.feedback.set(null), 4000);
  }
}
