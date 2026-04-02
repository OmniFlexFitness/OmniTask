import {
  Component,
  input,
  output,
  computed,
  signal,
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
import { Timeline } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data';

@Component({
  selector: 'app-task-timeline-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-timeline-view.component.html',
  styleUrls: ['./task-timeline-view.component.css'],
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
  private items = new DataSet<any>();
  private groups = new DataSet<any>();

  constructor() {
    effect(() => {
      const currentTasks = this.tasks();
      const currentProject = this.project();
      this.updateTimelineData(currentTasks, currentProject);
    });
  }

  ngAfterViewInit() {
    this.initTimeline();
  }

  ngOnDestroy() {
    if (this.timeline) {
      this.timeline.destroy();
    }
  }

  private initTimeline() {
    const options = {
      groupOrder: 'order',
      editable: {
        add: false,
        updateTime: true,
        updateGroup: true,
        remove: false,
      },
      margin: {
        item: 10,
        axis: 5
      },
      orientation: 'top',
      onMove: (item: any, callback: any) => {
        this.handleTaskMove(item);
        callback(item);
      },
      onUpdate: (item: any, callback: any) => {
         const t = this.tasks().find(task => task.id === item.id);
         if (t) {
           this.taskClick.emit(t);
         }
         callback(item);
      }
    };

    if (this.timelineContainer?.nativeElement) {
       this.timeline = new Timeline(this.timelineContainer.nativeElement, this.items, this.groups, options);
       
       this.timeline.on('doubleClick', (properties) => {
          if (properties.item) {
             const t = this.tasks().find(task => task.id === properties.item);
             if (t) {
               this.taskClick.emit(t);
             }
          }
       });
    }
  }

  private updateTimelineData(tasks: Task[], project: Project) {
    if (!project || !tasks) return;

    // Filter out 'done' tasks for the timeline view by default or keep them? 
    // Usually timelines show all active tasks. 
    // We'll show all of them but color 'done' tasks gray if needed.
    // The board-view filters out completed based on settings, but we'll show all passed in task array for now.

    const newGroups = project.sections.map((section, idx) => ({
      id: section.id,
      content: section.name,
      order: section.order,
      style: `color: ${section.color || '#fff'}; font-weight: bold;`
    }));

    const currentGroupIds = this.groups.getIds();
    const groupUpdates = newGroups.filter(g => currentGroupIds.includes(g.id));
    const groupAdds = newGroups.filter(g => !currentGroupIds.includes(g.id));
    const groupRemoves = currentGroupIds.filter((id: any) => !newGroups.find(g => g.id === id));

    if (groupUpdates.length) this.groups.update(groupUpdates);
    if (groupAdds.length) this.groups.add(groupAdds);
    if (groupRemoves.length) this.groups.remove(groupRemoves);

    const newItems = tasks.map(task => {
      let start = task.startDate ? this.toDate(task.startDate) : undefined;
      let end = task.dueDate ? this.toDate(task.dueDate) : undefined;

      if (!start) {
        if (end) {
          const s = new Date(end.getTime());
          s.setDate(s.getDate() - 1);
          start = s;
        } else {
           start = new Date();
           start.setHours(9, 0, 0, 0); 
        }
      }

      if (!end) {
        const e = new Date(start.getTime());
        e.setDate(e.getDate() + 1);
        end = e;
      }
      
      const section = project.sections.find(s => s.id === task.sectionId);
      
      const isDone = task.status === 'done';
      const color = isDone ? '#6b7280' : (section?.color || '#3b82f6');
      
      const bgColor = this.hexToRgba(color, isDone ? 0.1 : 0.2);
      const borderColor = this.hexToRgba(color, isDone ? 0.4 : 0.8);
      const textColor = isDone ? 'rgba(255,255,255,0.5)' : '#fff';

      const baseItem: any = {
        id: task.id,
        group: task.sectionId || (project.sections.length > 0 ? project.sections[0].id : undefined),
        content: `
          <div class="timeline-item-content" title="${task.title}">
            <span class="timeline-title">${task.title}</span>
          </div>
        `,
        style: `background-color: ${bgColor}; border-color: ${borderColor}; color: ${textColor};`
      };

      if (isDone) {
        // Complete items are milestones ('box' type) to prevent horizontal visual overlap 
        // since vis-timeline correctly stacks 'box' types based on DOM width
        baseItem.type = 'box';
        baseItem.start = task.dueDate ? this.toDate(task.dueDate) : (task.startDate ? this.toDate(task.startDate) : start);
        baseItem.className = 'vis-item-done';
      } else {
        baseItem.type = 'range';
        baseItem.start = start;
        baseItem.end = end;
      }

      return baseItem;
    });

    const currentItemIds = this.items.getIds();
    const itemUpdates = newItems.filter(i => currentItemIds.includes(i.id));
    const itemAdds = newItems.filter(i => !currentItemIds.includes(i.id));
    const itemRemoves = currentItemIds.filter((id: any) => !newItems.find(i => i.id === id));

    if (itemUpdates.length) this.items.update(itemUpdates);
    if (itemAdds.length) this.items.add(itemAdds);
    if (itemRemoves.length) this.items.remove(itemRemoves);

    if (this.timeline && (itemAdds.length > 0 || groupAdds.length > 0)) {
        if (currentItemIds.length === 0) {
            setTimeout(() => this.timeline!.fit(), 100);
        }
    }
  }

  private async handleTaskMove(item: any) {
    const start = item.start as Date;
    const end = item.end as Date;
    const sectionId = item.group as string;

    const t = this.tasks().find(task => task.id === item.id);
    if (t) {
        let currentStatus = t.status;
        let newStatus = currentStatus;
        if (t.sectionId !== sectionId) {
             const targetSection = this.project().sections.find(s => s.id === sectionId);
             if (targetSection) {
                  newStatus = this.getSectionStatus(targetSection);
             }
        }
        
        const updates: any = {
            sectionId: sectionId,
            status: newStatus
        };

        if (item.type === 'box' || !end) {
            updates.dueDate = start;
        } else {
            updates.startDate = start;
            updates.dueDate = end;
        }
        
        await this.taskService.updateTask(t.id, updates);
    }
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
      fullHex = cleanHex.split('').map((char) => char + char).join('');
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
  
  private getSectionStatus(section: any): 'todo' | 'in-progress' | 'done' {
    if (section.status) return section.status;
    const nameLower = section.name.toLowerCase();
    if (nameLower.includes('done') || nameLower.includes('complete')) return 'done';
    if (nameLower.includes('progress') || nameLower.includes('doing')) return 'in-progress';
    return 'todo';
  }
}
