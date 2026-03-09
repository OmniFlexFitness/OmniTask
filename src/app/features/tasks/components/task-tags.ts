import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Project } from '../../../core/models/domain.model';

@Component({
  selector: 'app-task-tags',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-tags.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskTagsComponent {
  project = input<Project | null>(null);
  selectedTags = input.required<Set<string>>();
  selectedTagsArray = input.required<string[]>();

  toggleTag = output<string>();
  addTag = output<string>();

  getTagColor = input.required<(tagName: string) => string>();
}
