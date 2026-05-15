import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
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
import { PointScaleManagerComponent } from './point-scale-manager.component';

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
    PointScaleManagerComponent,
  ],
  templateUrl: './project-settings-panel.component.html',
  styleUrls: ['./project-settings-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectSettingsPanelComponent {
  project = input.required<Project>();
  projectChanged = output<void>();
  projectDeleted = output<void>();
}
