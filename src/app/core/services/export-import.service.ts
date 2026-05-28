import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import { ProjectService } from './project.service';
import { TaskService } from './task.service';
import { Project, Task } from '../models/domain.model';

export type ExportFormat = 'csv' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  projectId: string | 'all';
  includeSubtasks: boolean;
  includeCompleted: boolean;
}

interface CsvRow {
  Title: string;
  Description: string;
  Status: string;
  Priority: string;
  Section: string;
  'Due Date': string;
  'Start Date': string;
  Assignees: string;
  Tags: string;
  'Created At': string;
  'Updated At': string;
  'Completed At': string;
  Project: string;
  'Parent Task': string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

@Injectable({ providedIn: 'root' })
export class ExportImportService {
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);

  async exportTasks(options: ExportOptions): Promise<{ data: string; filename: string }> {
    const projects = await this.resolveProjects(options.projectId);
    const allTasks: { task: Task; projectName: string; sectionName: string }[] = [];

    for (const project of projects) {
      const tasks = await this.taskService.getTasksByProjectOnce(project.id);
      for (const task of tasks) {
        if (!options.includeCompleted && task.status === 'done') continue;
        if (!options.includeSubtasks && task.parentId) continue;

        const section = project.sections.find((s) => s.id === task.sectionId);
        allTasks.push({
          task,
          projectName: project.name,
          sectionName: section?.name ?? '',
        });
      }
    }

    if (options.format === 'csv') {
      return this.generateCsv(allTasks, projects);
    }
    return this.generateJson(allTasks, projects);
  }

  parseCsvForImport(csvText: string): Partial<Task>[] {
    const lines = this.parseCsvLines(csvText);
    if (lines.length < 2) return [];

    const headers = lines[0];
    const titleIdx = headers.findIndex((h) => h.toLowerCase() === 'title');
    if (titleIdx === -1) return [];

    const colMap = this.buildColumnMap(headers);
    const tasks: Partial<Task>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (row.length === 0 || (row.length === 1 && row[0] === '')) continue;

      const title = row[titleIdx]?.trim();
      if (!title) continue;

      const task: Partial<Task> = {
        title,
        description: this.getCol(row, colMap, 'description') ?? '',
        status: this.parseStatus(this.getCol(row, colMap, 'status')),
        priority: this.parsePriority(this.getCol(row, colMap, 'priority')),
        tags: this.parseTags(this.getCol(row, colMap, 'tags')),
      };

      const dueStr = this.getCol(row, colMap, 'due date') ?? this.getCol(row, colMap, 'duedate');
      if (dueStr) {
        const d = new Date(dueStr);
        if (!isNaN(d.getTime())) task.dueDate = Timestamp.fromDate(d);
      }

      tasks.push(task);
    }

    return tasks;
  }

  parseJsonForImport(jsonText: string): { tasks: Partial<Task>[]; projects: Partial<Project>[] } {
    const data = JSON.parse(jsonText);

    if (data.version && data.tasks) {
      return {
        tasks: (data.tasks as Record<string, unknown>[]).map((t) => this.normalizeJsonTask(t)),
        projects: data.projects ?? [],
      };
    }

    if (Array.isArray(data)) {
      return {
        tasks: data.map((t: Record<string, unknown>) => this.normalizeJsonTask(t)),
        projects: [],
      };
    }

    return { tasks: [], projects: [] };
  }

  private async resolveProjects(projectId: string | 'all'): Promise<Project[]> {
    if (projectId === 'all') {
      return firstValueFrom(this.projectService.getMyProjects());
    }
    const project = await this.projectService.getProject(projectId);
    return project ? [project] : [];
  }

  private generateCsv(
    items: { task: Task; projectName: string; sectionName: string }[],
    _projects: Project[],
  ): { data: string; filename: string } {
    const rows: CsvRow[] = items.map(({ task, projectName, sectionName }) => ({
      Title: task.title,
      Description: task.description ?? '',
      Status: task.status,
      Priority: task.priority,
      Section: sectionName,
      'Due Date': this.formatDate(task.dueDate),
      'Start Date': this.formatDate(task.startDate),
      Assignees: (task.assigneeNames ?? []).join('; '),
      Tags: (task.tags ?? []).join('; '),
      'Created At': this.formatDate(task.createdAt),
      'Updated At': this.formatDate(task.updatedAt),
      'Completed At': this.formatDate(task.completedAt),
      Project: projectName,
      'Parent Task': task.parentId ?? '',
    }));

    const headers = Object.keys(rows[0] ?? {}) as (keyof CsvRow)[];
    const csvLines = [
      headers.map((h) => this.escapeCsvField(h)).join(','),
      ...rows.map((row) => headers.map((h) => this.escapeCsvField(String(row[h] ?? ''))).join(',')),
    ];

    const timestamp = new Date().toISOString().slice(0, 10);
    return {
      data: csvLines.join('\n'),
      filename: `omnitask-export-${timestamp}.csv`,
    };
  }

  private generateJson(
    items: { task: Task; projectName: string; sectionName: string }[],
    projects: Project[],
  ): { data: string; filename: string } {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      app: 'OmniTask',
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        sections: p.sections,
        tags: p.tags,
        status: p.status,
      })),
      tasks: items.map(({ task, projectName, sectionName }) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        section: sectionName,
        project: projectName,
        projectId: task.projectId,
        sectionId: task.sectionId,
        dueDate: this.formatDate(task.dueDate),
        startDate: this.formatDate(task.startDate),
        completedAt: this.formatDate(task.completedAt),
        assigneeNames: task.assigneeNames ?? [],
        tags: task.tags ?? [],
        subtasks: task.subtasks ?? [],
        parentId: task.parentId,
        blockingIds: task.blockingIds ?? [],
        blockedByIds: task.blockedByIds ?? [],
        customFieldValues: task.customFieldValues ?? {},
        pointValue: task.pointValue,
        createdAt: this.formatDate(task.createdAt),
        updatedAt: this.formatDate(task.updatedAt),
      })),
    };

    const timestamp = new Date().toISOString().slice(0, 10);
    return {
      data: JSON.stringify(exportData, null, 2),
      filename: `omnitask-export-${timestamp}.json`,
    };
  }

  private formatDate(value: unknown): string {
    if (!value) return '';
    if (value instanceof Timestamp) return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return '';
  }

  private escapeCsvField(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  private parseCsvLines(csv: string): string[][] {
    const lines: string[][] = [];
    let current: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < csv.length; i++) {
      const char = csv[i];
      const next = csv[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          field += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          current.push(field);
          field = '';
        } else if (char === '\n' || (char === '\r' && next === '\n')) {
          current.push(field);
          field = '';
          lines.push(current);
          current = [];
          if (char === '\r') i++;
        } else {
          field += char;
        }
      }
    }

    if (field || current.length > 0) {
      current.push(field);
      lines.push(current);
    }

    return lines;
  }

  private buildColumnMap(headers: string[]): Map<string, number> {
    const map = new Map<string, number>();
    headers.forEach((h, i) => map.set(h.toLowerCase().trim(), i));
    return map;
  }

  private getCol(row: string[], colMap: Map<string, number>, key: string): string | undefined {
    const idx = colMap.get(key);
    if (idx === undefined) return undefined;
    return row[idx]?.trim();
  }

  private parseStatus(val: string | undefined): Task['status'] {
    if (!val) return 'todo';
    const lower = val.toLowerCase().trim();
    if (lower === 'done' || lower === 'completed' || lower === 'complete') return 'done';
    if (lower === 'in-progress' || lower === 'in progress' || lower === 'active') return 'in-progress';
    return 'todo';
  }

  private parsePriority(val: string | undefined): Task['priority'] {
    if (!val) return 'medium';
    const lower = val.toLowerCase().trim();
    if (lower === 'high' || lower === 'urgent' || lower === 'critical') return 'high';
    if (lower === 'low' || lower === 'minor') return 'low';
    return 'medium';
  }

  private parseTags(val: string | undefined): string[] {
    if (!val) return [];
    return val
      .split(/[;,]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  private normalizeJsonTask(t: Record<string, unknown>): Partial<Task> {
    return {
      title: (t['title'] as string) ?? '',
      description: (t['description'] as string) ?? '',
      status: this.parseStatus(t['status'] as string),
      priority: this.parsePriority(t['priority'] as string),
      tags: Array.isArray(t['tags']) ? t['tags'] : [],
    };
  }

  downloadFile(data: string, filename: string, mimeType: string): void {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
