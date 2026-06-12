import { Component, input, output, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Project } from '../../../core/models/domain.model';
import { SectionManagerComponent } from './section-manager.component';
import { TagManagerComponent } from './tag-manager.component';
import { CustomFieldManagerComponent } from './custom-field-manager/custom-field-manager.component';
import { ProjectMemberManagerComponent } from './project-member-manager.component';
import { ProjectBasicInfoComponent } from './project-basic-info.component';
import { ProjectDangerZoneComponent } from './project-danger-zone.component';
import { ProjectGoogleTasksSyncComponent } from './project-google-tasks-sync.component';
import { ProjectGoogleSheetsSyncComponent } from './project-google-sheets-sync.component';
import { ProjectGoogleCalendarSyncComponent } from './project-google-calendar-sync.component';
import { PointScaleManagerComponent } from './point-scale-manager.component';
import { ProjectAutomationPanelComponent } from './project-automation-panel.component';
import { TaskService } from '../../../core/services/task.service';
import { downloadTextFile, toCsv } from '../../../core/utils/download.utils';

/**
 * Project Settings Panel Component
 * Comprehensive project configuration including basic info, sections, tags, custom fields
 */
@Component({
  selector: 'app-project-settings-panel',
  standalone: true,
  imports: [
    CommonModule,
    SectionManagerComponent,
    TagManagerComponent,
    CustomFieldManagerComponent,
    ProjectMemberManagerComponent,
    ProjectBasicInfoComponent,
    ProjectDangerZoneComponent,
    ProjectGoogleTasksSyncComponent,
    ProjectGoogleSheetsSyncComponent,
    ProjectGoogleCalendarSyncComponent,
    PointScaleManagerComponent,
    ProjectAutomationPanelComponent,
  ],
  templateUrl: './project-settings-panel.component.html',
  styleUrls: ['./project-settings-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectSettingsPanelComponent {
  private readonly taskService = inject(TaskService);

  project = input.required<Project>();
  projectChanged = output<void>();
  projectDeleted = output<void>();

  async exportTasksJson(): Promise<void> {
    const p = this.project();
    const tasks = await this.taskService.getTasksByProjectOnce(p.id);
    const payload = {
      exportedAt: new Date().toISOString(),
      project: { id: p.id, name: p.name },
      tasks,
    };
    downloadTextFile({
      filename: `omnitask-${p.name || p.id}-tasks.json`.replace(/\s+/g, '_'),
      text: JSON.stringify(payload, null, 2),
      mimeType: 'application/json;charset=utf-8',
    });
  }

  async exportTasksCsv(): Promise<void> {
    const p = this.project();
    const tasks = await this.taskService.getTasksByProjectOnce(p.id);
    const rows = tasks.map((t) => ({
      Title: t.title,
      Description: t.description ?? '',
      Status: t.status,
      Priority: t.priority,
      DueDate: this.formatDate(t.dueDate),
      Assignees: (t.assigneeNames ?? []).join('; '),
      Tags: (t.tags ?? []).join('; '),
      SectionId: t.sectionId ?? '',
      CreatedAt: this.formatDate(t.createdAt),
      UpdatedAt: this.formatDate(t.updatedAt),
    }));

    const columns = [
      'Title',
      'Description',
      'Status',
      'Priority',
      'DueDate',
      'Assignees',
      'Tags',
      'SectionId',
      'CreatedAt',
      'UpdatedAt',
    ];

    downloadTextFile({
      filename: `omnitask-${p.name || p.id}-tasks.csv`.replace(/\s+/g, '_'),
      text: toCsv(rows, columns),
      mimeType: 'text/csv;charset=utf-8',
    });
  }

  private formatDate(value: unknown): string {
    if (!value) return '';
    try {
      const anyVal = value as any;
      const d: Date = anyVal?.toDate ? anyVal.toDate() : new Date(anyVal);
      return Number.isNaN(d.getTime()) ? '' : d.toISOString();
    } catch {
      return '';
    }
  }
}
