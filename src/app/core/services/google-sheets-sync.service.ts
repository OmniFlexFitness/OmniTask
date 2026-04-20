import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { GoogleSheetsService } from './google-sheets.service';
import { Task, Project, Section } from '../models/domain.model';

/**
 * Default tab name used when a brand-new spreadsheet is created for a project,
 * or when the user has not picked a specific tab yet.
 */
export const DEFAULT_SHEET_TAB_NAME = 'Tasks';

/**
 * Column order written to the spreadsheet. The first row of the sheet is
 * always these headers; subsequent rows correspond to individual tasks.
 *
 * The "ID" column stores the OmniTask task document ID so we can match rows
 * back to tasks across syncs even if the title changes.
 */
export const SHEET_HEADERS = [
  'ID',
  'Title',
  'Description',
  'Status',
  'Priority',
  'Assignees',
  'Due Date',
  'Tags',
  'Section',
  'Updated At',
] as const;

type SheetColumn = (typeof SHEET_HEADERS)[number];

export interface SheetSyncResult {
  added: number; // Tasks added to OmniTask from sheet
  updated: number; // OmniTask tasks updated from sheet
  pushed: number; // OmniTask tasks written to the sheet
}

/**
 * Service responsible for synchronizing OmniTask projects/tasks with a
 * designated Google Sheet. Mirrors the structure of GoogleTasksSyncService.
 *
 * Sync model:
 *   - Headers are written to row 1.
 *   - Each task occupies a single row, keyed by the task's Firestore doc ID in column A.
 *   - On sync, OmniTask is considered the source of truth for tasks with an existing ID;
 *     rows in the sheet without a matching OmniTask ID are imported as new tasks.
 *   - Status / priority / due date values are parsed tolerantly from the sheet.
 */
@Injectable({ providedIn: 'root' })
export class GoogleSheetsSyncService {
  private readonly firestore = inject(Firestore);
  private readonly sheetsService = inject(GoogleSheetsService);
  private readonly tasksCollection = collection(this.firestore, 'tasks');

  /**
   * Serialize a date-ish value to an ISO string for sheet storage.
   * Accepts Date, Firestore Timestamp, or undefined/null.
   */
  private toISODate(value: unknown): string {
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
   * Parse an ISO/Sheet-formatted date string into a JS Date.
   * Returns undefined if the input is empty or unparseable.
   */
  private parseDate(value: string | undefined): Date | undefined {
    if (!value || !value.trim()) return undefined;
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }

  /**
   * Normalize a status string from the sheet into OmniTask's status enum.
   */
  private parseStatus(value: string | undefined): Task['status'] {
    const v = (value || '').toLowerCase().trim();
    if (v === 'done' || v === 'completed' || v === 'complete') return 'done';
    if (v === 'in-progress' || v === 'in progress' || v === 'wip' || v === 'doing')
      return 'in-progress';
    return 'todo';
  }

  /**
   * Normalize a priority string from the sheet into OmniTask's priority enum.
   */
  private parsePriority(value: string | undefined): Task['priority'] {
    const v = (value || '').toLowerCase().trim();
    if (v === 'high' || v === 'urgent') return 'high';
    if (v === 'low') return 'low';
    return 'medium';
  }

  /**
   * Convert an OmniTask Task into the 10-cell row representation used in Sheets.
   * Missing/undefined fields become empty strings so the row has a stable length.
   */
  public transformToSheetRow(task: Task): string[] {
    const row: Record<SheetColumn, string> = {
      ID: task.id ?? '',
      Title: task.title ?? '',
      Description: (task.description ?? '').replace(/\r?\n/g, '  '),
      Status: task.status ?? 'todo',
      Priority: task.priority ?? 'medium',
      Assignees: (task.assigneeNames ?? []).join(', '),
      'Due Date': this.toISODate(task.dueDate),
      Tags: (task.tags ?? []).join(', '),
      Section: task.sectionId ?? '',
      'Updated At': this.toISODate(task.updatedAt) || new Date().toISOString(),
    };
    return SHEET_HEADERS.map((h) => row[h]);
  }

  /**
   * Convert a sheet row back into a partial Task suitable for Firestore.
   * Does not include the Firestore document ID — callers decide whether to
   * create a new doc or merge into an existing one.
   */
  public transformFromSheetRow(
    row: string[],
    projectId: string,
    spreadsheetId: string,
    sections: Section[],
  ): { id: string; data: Partial<Task> } {
    const cell = (i: number) => (row[i] ?? '').toString();

    const id = cell(0).trim();
    const status = this.parseStatus(cell(3));
    const data: Partial<Task> = {
      title: cell(1) || 'Untitled',
      description: cell(2) || '',
      status,
      priority: this.parsePriority(cell(4)),
      assigneeNames: cell(5)
        ? cell(5)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      tags: cell(7)
        ? cell(7)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      projectId,
      googleSheetId: spreadsheetId,
      googleSheetRowId: id || undefined,
      isGoogleSheetTask: true,
      order: 0,
    };

    const due = this.parseDate(cell(6));
    if (due) data.dueDate = due;

    // Map Section column (either literal sectionId or section name) to a sectionId.
    const sectionCell = cell(8).trim();
    if (sectionCell) {
      const byId = sections.find((s) => s.id === sectionCell);
      const byName = sections.find(
        (s) => s.name.toLowerCase() === sectionCell.toLowerCase(),
      );
      const matched = byId || byName;
      if (matched) data.sectionId = matched.id;
    }
    // Fall back to mapping from status if no section specified.
    if (!data.sectionId) {
      const byStatus = sections.find((s) => s.status === status);
      if (byStatus) data.sectionId = byStatus.id;
    }

    return { id, data };
  }

  /**
   * Ensure the target tab has our header row in row 1. Idempotent.
   */
  async ensureHeaders(spreadsheetId: string, tabName: string): Promise<void> {
    const range = `${tabName}!A1:${this.columnLetter(SHEET_HEADERS.length)}1`;
    await firstValueFrom(
      this.sheetsService.updateValues(spreadsheetId, range, [Array.from(SHEET_HEADERS)]),
    );
  }

  /**
   * Convert a 1-indexed column number to its A1 letter (1 => "A", 27 => "AA").
   */
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

  private async getProjectSections(projectId: string): Promise<Section[]> {
    const projSnap = await getDoc(doc(this.firestore, `projects/${projectId}`));
    if (!projSnap.exists()) return [];
    return ((projSnap.data() as Project).sections ?? []) as Section[];
  }

  private async getProjectTasks(projectId: string): Promise<Array<Task & { id: string }>> {
    const q = query(this.tasksCollection, where('projectId', '==', projectId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...(d.data() as Task), id: d.id }));
  }

  /**
   * Push every task in the project to the spreadsheet, overwriting existing rows.
   * This is a one-way operation (OmniTask -> Sheet) meant for initial export.
   */
  async pushProjectToSheet(
    projectId: string,
    spreadsheetId: string,
    tabName: string,
  ): Promise<{ pushed: number }> {
    await this.ensureHeaders(spreadsheetId, tabName);
    const tasks = await this.getProjectTasks(projectId);

    // Clear the existing data region (everything below the header row).
    const lastCol = this.columnLetter(SHEET_HEADERS.length);
    await firstValueFrom(
      this.sheetsService.clearValues(spreadsheetId, `${tabName}!A2:${lastCol}`),
    );

    if (tasks.length === 0) {
      return { pushed: 0 };
    }

    const rows = tasks.map((t) => this.transformToSheetRow(t));
    await firstValueFrom(
      this.sheetsService.updateValues(
        spreadsheetId,
        `${tabName}!A2:${lastCol}${1 + rows.length}`,
        rows,
      ),
    );

    // Mark each task with its sheet linkage for future syncs.
    await Promise.all(
      tasks.map((t) =>
        updateDoc(doc(this.firestore, `tasks/${t.id}`), {
          googleSheetId: spreadsheetId,
          googleSheetRowId: t.id,
          isGoogleSheetTask: true,
          updatedAt: new Date(),
        }),
      ),
    );

    return { pushed: rows.length };
  }

  /**
   * Bidirectional sync between OmniTask and the designated sheet.
   *
   * Strategy:
   *   1. Read all rows from the sheet (below the header).
   *   2. For each row with an ID matching an OmniTask task -> update that task in place.
   *   3. For each row without an ID (or with an unknown ID) -> create a new OmniTask task
   *      and write its new ID back to the sheet.
   *   4. For any OmniTask tasks not present in the sheet -> append them to the sheet.
   */
  async syncProjectWithSheet(
    projectId: string,
    spreadsheetId: string,
    tabName: string,
  ): Promise<SheetSyncResult> {
    await this.ensureHeaders(spreadsheetId, tabName);

    const sections = await this.getProjectSections(projectId);
    const existingTasks = await this.getProjectTasks(projectId);
    const tasksById = new Map(existingTasks.map((t) => [t.id, t]));

    const lastCol = this.columnLetter(SHEET_HEADERS.length);
    const valuesResp = await firstValueFrom(
      this.sheetsService.getValues(spreadsheetId, `${tabName}!A2:${lastCol}`),
    );
    const sheetRows = valuesResp.values ?? [];

    let added = 0;
    let updated = 0;
    let pushed = 0;
    const seenTaskIds = new Set<string>();

    // Track rows that need their (newly-created) task ID written back to the sheet.
    const writebacks: Array<{ rowIndex: number; taskId: string }> = [];

    for (let i = 0; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      // Skip blank rows (no title and no id).
      if (!row || (!row[0] && !row[1])) continue;

      const parsed = this.transformFromSheetRow(row, projectId, spreadsheetId, sections);
      const existing = parsed.id ? tasksById.get(parsed.id) : undefined;

      if (existing) {
        seenTaskIds.add(existing.id);
        await updateDoc(doc(this.firestore, `tasks/${existing.id}`), {
          ...parsed.data,
          googleSheetRowId: existing.id,
          updatedAt: new Date(),
        });
        updated++;
      } else {
        // New task originating from the sheet.
        const docRef = await addDoc(this.tasksCollection, {
          ...parsed.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        seenTaskIds.add(docRef.id);
        writebacks.push({ rowIndex: i + 2, taskId: docRef.id }); // +2: header row + 1-indexed
        // Persist the generated Firestore ID as the row's sheet row id.
        await updateDoc(docRef, { googleSheetRowId: docRef.id });
        added++;
      }
    }

    // Write back generated IDs into column A for newly-created rows.
    for (const wb of writebacks) {
      await firstValueFrom(
        this.sheetsService.updateValues(spreadsheetId, `${tabName}!A${wb.rowIndex}`, [
          [wb.taskId],
        ]),
      );
    }

    // Append any OmniTask tasks that aren't in the sheet yet.
    const missingTasks = existingTasks.filter((t) => !seenTaskIds.has(t.id));
    if (missingTasks.length > 0) {
      const appendRows = missingTasks.map((t) => this.transformToSheetRow(t));
      await firstValueFrom(
        this.sheetsService.appendValues(
          spreadsheetId,
          `${tabName}!A1:${lastCol}1`,
          appendRows,
        ),
      );
      await Promise.all(
        missingTasks.map((t) =>
          updateDoc(doc(this.firestore, `tasks/${t.id}`), {
            googleSheetId: spreadsheetId,
            googleSheetRowId: t.id,
            isGoogleSheetTask: true,
          }),
        ),
      );
      pushed = missingTasks.length;
    }

    return { added, updated, pushed };
  }

  /**
   * Create a new spreadsheet for the project and link it.
   * @returns The new spreadsheetId on success.
   */
  async createSheetForProject(
    projectId: string,
    projectName: string,
  ): Promise<{ spreadsheetId: string; spreadsheetUrl: string; tabName: string }> {
    const resp = await firstValueFrom(
      this.sheetsService.createSpreadsheet(`${projectName} — OmniTask`, DEFAULT_SHEET_TAB_NAME),
    );
    const spreadsheetId = resp.spreadsheetId;
    const tabName = resp.sheets?.[0]?.properties?.title ?? DEFAULT_SHEET_TAB_NAME;

    await this.ensureHeaders(spreadsheetId, tabName);

    await updateDoc(doc(this.firestore, `projects/${projectId}`), {
      googleSheetId: spreadsheetId,
      googleSheetName: resp.properties.title,
      googleSheetTabName: tabName,
      sheetSyncEnabled: true,
      sheetSyncStatus: 'pending',
    });

    return { spreadsheetId, spreadsheetUrl: resp.spreadsheetUrl, tabName };
  }
}
