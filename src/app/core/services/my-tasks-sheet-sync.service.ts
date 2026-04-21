import { Injectable, inject } from '@angular/core';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { GoogleSheetsService, BatchUpdateValuesData } from './google-sheets.service';
import { AuthService } from '../auth/auth.service';
import { Project, Task } from '../models/domain.model';
import { UserProfile } from '../models/user.model';

/** Default workbook tab names for the user-centric "My Tasks" sheet. */
export const MY_TASKS_SHEET_DEFAULTS = {
  tasksTab: 'My Tasks',
  projectsTab: 'My Projects',
  contributionsTab: 'Contributions',
} as const;

/** Column headers written to row 1 of the "My Tasks" tab. */
export const MY_TASKS_TASK_HEADERS = [
  'Title',
  'Project',
  'Status',
  'Priority',
  'Due Date',
  'Role',
  'Tags',
  'Description',
  'ID',
  'Updated At',
] as const;

/** Column headers written to row 1 of the "My Projects" tab. */
export const MY_PROJECTS_HEADERS = [
  'Project',
  'Status',
  'Role',
  'Members',
  'Total Tasks',
  'My Tasks',
  'Completed',
  'Created At',
  'ID',
] as const;

/** Column headers written to row 1 of the "Contributions" tab. */
export const MY_CONTRIBUTIONS_HEADERS = [
  'Project',
  'Tasks Completed',
  'Tasks In Progress',
  'Tasks Created',
  'Last Activity',
] as const;

/**
 * Writes a per-user spreadsheet that mirrors the My Tasks dashboard data.
 *
 * Unlike {@link GoogleSheetsSyncService}, which pushes one project's tasks
 * to a project-linked sheet, this service writes the sheet belonging to the
 * signed-in user and indexes rows by the user's own UID. The resulting
 * workbook has three tabs:
 *
 *   - "My Tasks"       — every task the user is assigned to or created
 *   - "My Projects"    — every project the user is a member of, with counts
 *   - "Contributions"  — per-project contribution metrics for the user
 *
 * This is intentionally a one-way push (OmniTask → Sheet) — users opening
 * the spreadsheet are expected to consume the data, not edit it. Task edits
 * continue to flow through the project-scoped sheet when one is linked.
 */
@Injectable({ providedIn: 'root' })
export class MyTasksSheetSyncService {
  private readonly firestore = inject(Firestore);
  private readonly sheetsService = inject(GoogleSheetsService);
  private readonly auth = inject(AuthService);

  /** 1-indexed column number → A1 column letter (1 → "A", 27 → "AA"). */
  private columnLetter(col: number): string {
    let result = '';
    let n = col;
    while (n > 0) {
      const rem = (n - 1) % 26;
      result = String.fromCharCode(65 + rem) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  }

  /** Quote a tab name for use in an A1 range when it contains spaces. */
  private quoteTabName(tabName: string): string {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tabName)) return tabName;
    return `'${tabName.replace(/'/g, "''")}'`;
  }

  private range(tabName: string, cells: string): string {
    return `${this.quoteTabName(tabName)}!${cells}`;
  }

  private toISO(value: unknown): string {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object' && value !== null && 'toDate' in (value as object)) {
      const d = (value as { toDate: () => Date }).toDate();
      return d instanceof Date ? d.toISOString() : '';
    }
    if (typeof value === 'string') return value;
    return '';
  }

  /**
   * Create a new spreadsheet for the user and stamp its id on the user's
   * profile. Used on first sync when the user has no sheet yet.
   */
  async createSheetForUser(user: UserProfile): Promise<{
    spreadsheetId: string;
    spreadsheetUrl: string;
  }> {
    const title = `${user.displayName || user.email || 'OmniTask'} — My Tasks`;
    const resp = await firstValueFrom(
      this.sheetsService.createSpreadsheet(title, MY_TASKS_SHEET_DEFAULTS.tasksTab),
    );
    const spreadsheetId = resp.spreadsheetId;

    // Add the two extra tabs (Projects and Contributions) alongside the
    // default first tab created by createSpreadsheet.
    await firstValueFrom(
      this.sheetsService.batchUpdateSheet(spreadsheetId, [
        { addSheet: { properties: { title: MY_TASKS_SHEET_DEFAULTS.projectsTab } } },
        { addSheet: { properties: { title: MY_TASKS_SHEET_DEFAULTS.contributionsTab } } },
      ]),
    );

    await updateDoc(doc(this.firestore, `users/${user.uid}`), {
      myTasksSheetId: spreadsheetId,
      myTasksSheetTabName: MY_TASKS_SHEET_DEFAULTS.tasksTab,
      myTasksSheetSyncStatus: 'pending',
    });

    return { spreadsheetId, spreadsheetUrl: resp.spreadsheetUrl };
  }

  /**
   * Shape a task into the row written into the "My Tasks" tab.
   * `role` reflects whether the user is an assignee, the creator, or both.
   */
  private taskToRow(task: Task, project: Project | undefined, userId: string): string[] {
    const isAssignee = !!task.assigneeIds?.includes(userId) || task.assignedToId === userId;
    const isCreator = task.createdById === userId;
    const role = isAssignee && isCreator
      ? 'Assignee + Creator'
      : isAssignee
        ? 'Assignee'
        : isCreator
          ? 'Creator'
          : 'Member';
    return [
      task.title ?? '',
      project?.name ?? task.projectId ?? '',
      task.status ?? 'todo',
      task.priority ?? 'low',
      this.toISO(task.dueDate),
      role,
      (task.tags ?? []).join(', '),
      task.description ?? '',
      task.id ?? '',
      this.toISO(task.updatedAt) || new Date().toISOString(),
    ];
  }

  /**
   * Shape a project into the row written into the "My Projects" tab.
   * `myTasks` and `myCompleted` are pre-computed counts so the service has
   * no knowledge of the overall task list.
   */
  private projectToRow(
    project: Project,
    userId: string,
    totalTasks: number,
    myTasks: number,
    myCompleted: number,
  ): string[] {
    const role = project.ownerId === userId ? 'Owner' : 'Member';
    return [
      project.name ?? '',
      project.status ?? 'active',
      role,
      String(project.memberIds?.length ?? 0),
      String(totalTasks),
      String(myTasks),
      String(myCompleted),
      this.toISO(project.createdAt),
      project.id ?? '',
    ];
  }

  /**
   * Push the user's tasks and projects to their personal spreadsheet.
   * Creates the spreadsheet on first call. Idempotent — re-running overwrites
   * the previous contents, keeping the sheet in sync with the dashboard.
   *
   * @param user         The user whose view we're syncing.
   * @param tasks        Tasks the user is assigned to or created.
   * @param projects     Projects the user is a member of (active + archived).
   * @param projectTasks Map from projectId → full task list of that project.
   *                     Used to compute per-project counts without re-fetching.
   */
  async syncMySheet(
    user: UserProfile,
    tasks: Task[],
    projects: Project[],
    projectTasks: Map<string, Task[]>,
  ): Promise<{ spreadsheetId: string; pushed: number }> {
    if (!this.sheetsService.isAuthenticated()) {
      throw new Error('Google Sheets not authenticated. Please sign in again.');
    }

    let spreadsheetId = user.myTasksSheetId;
    if (!spreadsheetId) {
      const created = await this.createSheetForUser(user);
      spreadsheetId = created.spreadsheetId;
    }

    const tasksTab = user.myTasksSheetTabName || MY_TASKS_SHEET_DEFAULTS.tasksTab;
    const projectsTab = MY_TASKS_SHEET_DEFAULTS.projectsTab;
    const contribTab = MY_TASKS_SHEET_DEFAULTS.contributionsTab;

    const projectsById = new Map(projects.map((p) => [p.id, p]));

    const taskHeader = Array.from(MY_TASKS_TASK_HEADERS);
    const taskRows = tasks.map((t) => this.taskToRow(t, projectsById.get(t.projectId), user.uid));
    const taskLastCol = this.columnLetter(taskHeader.length);

    const projectHeader = Array.from(MY_PROJECTS_HEADERS);
    const projectRows = projects.map((p) => {
      const all = projectTasks.get(p.id) ?? [];
      const mine = all.filter(
        (t) => t.assigneeIds?.includes(user.uid) || t.assignedToId === user.uid,
      );
      const completed = mine.filter((t) => t.status === 'done').length;
      return this.projectToRow(p, user.uid, all.length, mine.length, completed);
    });
    const projectLastCol = this.columnLetter(projectHeader.length);

    const contribHeader = Array.from(MY_CONTRIBUTIONS_HEADERS);
    const contribRows = projects.map((p) => {
      const all = projectTasks.get(p.id) ?? [];
      const mine = all.filter(
        (t) =>
          t.assigneeIds?.includes(user.uid) ||
          t.assignedToId === user.uid ||
          t.createdById === user.uid,
      );
      const completed = mine.filter((t) => t.status === 'done').length;
      const inProgress = mine.filter((t) => t.status === 'in-progress').length;
      const created = all.filter((t) => t.createdById === user.uid).length;
      const latest = mine
        .map((t) => this.toISO(t.updatedAt))
        .filter(Boolean)
        .sort()
        .pop();
      return [p.name, String(completed), String(inProgress), String(created), latest ?? ''];
    });
    const contribLastCol = this.columnLetter(contribHeader.length);

    // Clear each tab's data region so stale rows from a prior sync don't linger
    // alongside the fresh rows we're about to write.
    await firstValueFrom(
      this.sheetsService.clearValues(spreadsheetId, this.range(tasksTab, `A1:${taskLastCol}`)),
    );
    await firstValueFrom(
      this.sheetsService.clearValues(
        spreadsheetId,
        this.range(projectsTab, `A1:${projectLastCol}`),
      ),
    );
    await firstValueFrom(
      this.sheetsService.clearValues(
        spreadsheetId,
        this.range(contribTab, `A1:${contribLastCol}`),
      ),
    );

    // Write headers + rows atomically via batchUpdateValues so the workbook
    // is never left in a half-updated state visible to a user.
    const writes: BatchUpdateValuesData[] = [
      {
        range: this.range(tasksTab, `A1:${taskLastCol}1`),
        values: [taskHeader],
      },
      {
        range: this.range(projectsTab, `A1:${projectLastCol}1`),
        values: [projectHeader],
      },
      {
        range: this.range(contribTab, `A1:${contribLastCol}1`),
        values: [contribHeader],
      },
    ];
    if (taskRows.length > 0) {
      writes.push({
        range: this.range(tasksTab, `A2:${taskLastCol}${1 + taskRows.length}`),
        values: taskRows,
      });
    }
    if (projectRows.length > 0) {
      writes.push({
        range: this.range(projectsTab, `A2:${projectLastCol}${1 + projectRows.length}`),
        values: projectRows,
      });
    }
    if (contribRows.length > 0) {
      writes.push({
        range: this.range(contribTab, `A2:${contribLastCol}${1 + contribRows.length}`),
        values: contribRows,
      });
    }
    await firstValueFrom(this.sheetsService.batchUpdateValues(spreadsheetId, writes));

    // Stamp sync metadata on the user doc so UI can render "last synced X".
    await updateDoc(doc(this.firestore, `users/${user.uid}`), {
      myTasksSheetId: spreadsheetId,
      lastMyTasksSheetSyncAt: new Date(),
      myTasksSheetSyncStatus: 'synced',
    });

    return { spreadsheetId, pushed: taskRows.length + projectRows.length + contribRows.length };
  }

  /**
   * Fire-and-forget upsert of a single task row into the user's sheet.
   * Appends a new row at the bottom of the "My Tasks" tab so the sheet stays
   * fresh after task edits without a full re-sync. Silently no-ops when the
   * user has no sheet yet or isn't authenticated.
   */
  async pushTaskRowForUser(
    user: UserProfile,
    task: Task,
    project: Project | undefined,
  ): Promise<boolean> {
    if (!user.myTasksSheetId) return false;
    if (!this.sheetsService.isAuthenticated()) return false;
    const tabName = user.myTasksSheetTabName || MY_TASKS_SHEET_DEFAULTS.tasksTab;
    const lastCol = this.columnLetter(MY_TASKS_TASK_HEADERS.length);
    try {
      const row = this.taskToRow(task, project, user.uid);
      await firstValueFrom(
        this.sheetsService.appendValues(
          user.myTasksSheetId,
          this.range(tabName, `A1:${lastCol}1`),
          [row],
        ),
      );
      return true;
    } catch (err) {
      console.warn('My Tasks sheet upsert failed for task', task.id, err);
      return false;
    }
  }
}
