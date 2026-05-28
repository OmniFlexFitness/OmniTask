import {
  Component,
  input,
  output,
  inject,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Task, Project } from '../../core/models/domain.model';
import { TaskService } from '../../core/services/task.service';
import type { DataSet } from 'vis-data';
import type { Timeline, TimelineOptions } from 'vis-timeline/standalone';

interface TimelineGroup {
  id: string;
  content: string;
  order?: number;
  style?: string;
}

interface AppTimelineItem {
  id: string;
  group?: string;
  content: string;
  start: Date;
  end?: Date;
  type?: string;
  className?: string;
  style?: string;
}

const DEFAULT_START_HOUR = 9;

@Component({
  selector: 'app-task-timeline-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-timeline-view.component.html',
  styleUrls: [
    '../../../../node_modules/vis-timeline/styles/vis-timeline-graph2d.css',
    './task-timeline-view.component.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskTimelineViewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('timelineContainer', { static: true }) timelineContainer!: ElementRef;

  private readonly taskService = inject(TaskService);

  // Inputs
  tasks = input.required<Task[]>();
  project = input.required<Project>();

  // Outputs
  taskClick = output<Task>();

  private timeline: Timeline | null = null;
  private items: DataSet<AppTimelineItem> | null = null;
  private groups: DataSet<TimelineGroup> | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    effect(() => {
      const currentTasks = this.tasks();
      const currentProject = this.project();
      if (this.items && this.groups) {
        this.updateTimelineData(currentTasks, currentProject);
      }
    });
  }

  ngAfterViewInit() {
    this.initPromise = this.initTimeline();
  }

  ngOnDestroy() {
    if (this.timeline) {
      this.timeline.destroy();
    }
  }

  private async initTimeline(): Promise<void> {
    const [{ Timeline: TimelineCtor }, { DataSet: DataSetCtor }] = await Promise.all([
      import('vis-timeline/standalone'),
      import('vis-data'),
    ]);

    this.items = new DataSetCtor<AppTimelineItem>();
    this.groups = new DataSetCtor<TimelineGroup>();

    const options: TimelineOptions = {
      groupOrder: 'order',
      editable: {
        add: false,
        updateTime: true,
        updateGroup: true,
        remove: false,
      },
      margin: {
        item: 10,
        axis: 5,
      },
      orientation: 'top',
      onMove: (item, callback) => {
        void this.handleTaskMove(item as AppTimelineItem & { end?: Date });
        callback(item);
      },
      onUpdate: (item, callback) => {
        const t = this.tasks().find((task) => task.id === String(item.id));
        if (t) {
          this.taskClick.emit(t);
        }
        callback(item);
      },
    };

    if (this.timelineContainer?.nativeElement) {
      this.timeline = new TimelineCtor(
        this.timelineContainer.nativeElement,
        this.items,
        this.groups,
        options,
      );

      this.timeline.on('doubleClick', (properties: { item?: string }) => {
        if (properties.item) {
          const t = this.tasks().find((task) => task.id === properties.item);
          if (t) {
            this.taskClick.emit(t);
          }
        }
      });

      this.updateTimelineData(this.tasks(), this.project());
    }
  }

  private updateTimelineData(tasks: Task[], project: Project) {
    if (!project || !tasks || !this.items || !this.groups) return;

    const newGroups = project.sections.map((section) => ({
      id: section.id,
      content: section.name,
      order: section.order,
      style: `color: ${section.color || '#fff'}; font-weight: bold;`,
    }));

    const currentGroupIds = this.groups.getIds();
    const groupUpdates = newGroups.filter((g) => currentGroupIds.includes(g.id));
    const groupAdds = newGroups.filter((g) => !currentGroupIds.includes(g.id));
    const groupRemoves = currentGroupIds.filter((id) => !newGroups.find((g) => g.id === id));

    if (groupUpdates.length) this.groups.update(groupUpdates);
    if (groupAdds.length) this.groups.add(groupAdds);
    if (groupRemoves.length) this.groups.remove(groupRemoves);

    const newItems = tasks.map((task) => {
      let start = task.startDate ? this.toDate(task.startDate) : undefined;
      let end = task.dueDate ? this.toDate(task.dueDate) : undefined;

      if (!start) {
        if (end) {
          const s = new Date(end.getTime());
          s.setDate(s.getDate() - 1);
          start = s;
        } else {
          start = new Date();
          start.setHours(DEFAULT_START_HOUR, 0, 0, 0);
        }
      }

      if (!end) {
        const e = new Date(start.getTime());
        e.setDate(e.getDate() + 1);
        end = e;
      }

      const section = project.sections.find((s) => s.id === task.sectionId);

      const isDone = task.status === 'done';
      const color = isDone ? '#6b7280' : section?.color || '#3b82f6';

      const bgColor = this.hexToRgba(color, isDone ? 0.1 : 0.2);
      const borderColor = this.hexToRgba(color, isDone ? 0.4 : 0.8);
      const textColor = isDone ? 'rgba(255,255,255,0.5)' : '#fff';

      const safeTitle = this.escapeHtml(task.title);
      const baseItem: Partial<AppTimelineItem> & {
        id: string;
        group: string | undefined;
        content: string;
      } = {
        id: task.id,
        group: task.sectionId || (project.sections.length > 0 ? project.sections[0].id : undefined),
        content: `
          <div class="timeline-item-content" title="${safeTitle}">
            <span class="timeline-title">${safeTitle}</span>
          </div>
        `,
        style: `background-color: ${bgColor}; border-color: ${borderColor}; color: ${textColor};`,
      };

      if (isDone) {
        baseItem.type = 'box';
        baseItem.start = task.dueDate
          ? this.toDate(task.dueDate)
          : task.startDate
            ? this.toDate(task.startDate)
            : start;
        baseItem.className = 'vis-item-done';
      } else {
        baseItem.type = 'range';
        baseItem.start = start;
        baseItem.end = end;
      }

      return baseItem as AppTimelineItem;
    });

    const currentItemIds = this.items.getIds();
    const itemUpdates = newItems.filter((i) => currentItemIds.includes(i.id));
    const itemAdds = newItems.filter((i) => !currentItemIds.includes(i.id));
    const itemRemoves = currentItemIds.filter((id) => !newItems.find((i) => i.id === id));

    if (itemUpdates.length) this.items.update(itemUpdates);
    if (itemAdds.length) this.items.add(itemAdds);
    if (itemRemoves.length) this.items.remove(itemRemoves);

    if (this.timeline && (itemAdds.length > 0 || groupAdds.length > 0)) {
      if (currentItemIds.length === 0) {
        requestAnimationFrame(() => {
          if (this.timeline) this.timeline.fit();
        });
      }
    }
  }

  private async handleTaskMove(item: AppTimelineItem & { end?: Date }) {
    const start = item.start as Date;
    const end = item.end as Date;
    const sectionId = item.group as string;

    const t = this.tasks().find((task) => task.id === item.id);
    if (t) {
      try {
        let currentStatus = t.status;
        let newStatus = currentStatus;
        if (t.sectionId !== sectionId) {
          const targetSection = this.project().sections.find((s) => s.id === sectionId);
          if (targetSection) {
            newStatus = this.getSectionStatus(targetSection);
          }
        }

        const updates: Partial<Task> = {
          sectionId: sectionId,
          status: newStatus,
        };

        if (item.type === 'box' || !end) {
          updates.dueDate = start;
        } else {
          updates.startDate = start;
          updates.dueDate = end;
        }

        await this.taskService.updateTask(t.id, updates);
      } catch (error) {
        console.error('Failed to move task:', error);
        this.updateTimelineData(this.tasks(), this.project());
      }
    }
  }

  private escapeHtml(unsafe: string): string {
    return (unsafe || '').replace(/[&<>"']/g, function (m) {
      switch (m) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        default:
          return '&#039;';
      }
    });
  }

  private toDate(dateValue: unknown): Date {
    if (dateValue instanceof Date) return dateValue;
    if (dateValue && typeof dateValue === 'object' && 'toDate' in dateValue) {
      return (dateValue as { toDate: () => Date }).toDate();
    }
    return new Date(dateValue as string | number);
  }

  private hexToRgba(hex: string, alpha: number): string {
    const cleanHex = hex.replace(/^#/, '');
    let fullHex = cleanHex;
    if (cleanHex.length === 3) {
      fullHex = cleanHex
        .split('')
        .map((char) => char + char)
        .join('');
    } else if (cleanHex.length !== 6) {
      return `rgba(100, 116, 139, ${alpha})`;
    }
    const r = parseInt(fullHex.substring(0, 2), 16);
    const g = parseInt(fullHex.substring(2, 4), 16);
    const b = parseInt(fullHex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      return `rgba(100, 116, 139, ${alpha})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private getSectionStatus(section: { status?: string; name: string }): 'todo' | 'in-progress' | 'done' {
    if (section.status === 'todo' || section.status === 'in-progress' || section.status === 'done') {
      return section.status;
    }
    const nameLower = section.name.toLowerCase();
    if (nameLower.includes('done') || nameLower.includes('complete')) return 'done';
    if (nameLower.includes('progress') || nameLower.includes('doing')) return 'in-progress';
    return 'todo';
  }
}
