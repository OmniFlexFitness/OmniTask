import { Component, signal , ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DailyScheduleComponent } from './daily-schedule.component';
import { WeeklyScheduleComponent } from './weekly-schedule.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-schedule',
  standalone: true,
  imports: [CommonModule, DailyScheduleComponent, WeeklyScheduleComponent],
  templateUrl: './schedule.component.html',
})
export class ScheduleComponent {
  activeTab = signal<'daily' | 'weekly'>('daily');
}
