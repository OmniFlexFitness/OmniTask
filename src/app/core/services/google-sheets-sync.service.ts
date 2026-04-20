import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { GoogleSheetsService, BatchUpdateValuesData } from './google-sheets.service';
import { Task, Project, Section } from '../models/domain.model';

/**
 * Default tab name used when a brand-new spreadsheet is created for a project,
 * or when the user has not picked a specific tab yet.
 */
export const DEFAULT_SHEET_TAB_NAME = 'Tasks';

/**
 * Column order written to the spreadsheet. Row 1 holds these headers; each
 * subsequent row is one task.
 *
 * Layout goals:
 *   - Human-readable, user-editable columns come first (Title, Section, Order,
 *     Status, Priority, Due Date, Assignees, Tags, Description). These are the
 *     columns a user actually opens the sheet to edit.
 *   - Bookkeeping columns that OmniTask owns come last (ID, Updated At). ID is
 *     an opaque Firestore doc ID; Updated At is a machine-managed timestamp.
 *   - "Section" holds the section's human name (e.g. "To Do"), not its ID, so
 *     users can reassign a task by typing another section name directly.
 *   - "Order" is the 0-based position within its section; editing it reorders
 *     the task in OmniTask's board/list views on the next sync.
 *
 * If you change this list, the schema-migration path in syncProjectWithSheet
 * will detect the mismatch against existing linked sheets and rewrite them.
 */
export const SHEET_HEADERS = [
  'Title',
  'Section',
  'Order',
  'Status',
  'Priority',
  'Due Date',
  'Assignees',
  'Tags',
  'Description',
  'ID',
  'Updated At',
] as const;

type SheetColumn = (typeof SHEET_HEADERS)[number];

/** 0-based column index for the given header name. */
function headerIndex(name: SheetColumn): number {
  return SHEET_HEADERS.indexOf(name);
}

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
   *
   * Defaults to 'low' when the cell is blank or unrecognized — rows added by
   * hand with only a title should get a sensible, low-urgency default that
   * users can promote later.
   */
  private parsePriority(value: string | undefined): Task['priority'] {
    const v = (value || '').toLowerCase().trim();
    if (v === 'high' || v === 'urgent') return 'high';
    if (v === 'medium' || v === 'med') return 'medium';
    return 'low';
  }

  /**
   * Convert an OmniTask Task into the row representation used in Sheets.
   * Missing/undefined fields become empty strings so the row has a stable length.
   *
   * @param sections  The project's sections, used to resolve task.sectionId
   *   into the human-readable section name written to column B.
   */
  public transformToSheetRow(task: Task, sections: Section[] = []): string[] {
    const sectionName = sections.find((s) => s.id === task.sectionId)?.name ?? '';
    const row: Record<SheetColumn, string> = {
      Title: task.title ?? '',
      Section: sectionName,
      Order: Number.isFinite(task.order) ? String(task.order) : '0',
      Status: task.status ?? 'todo',
      Priority: task.priority ?? 'low',
      'Due Date': this.toISODate(task.dueDate),
      Assignees: (task.assigneeNames ?? []).join(', '),
      Tags: (task.tags ?? []).join(', '),
      // Preserve newlines — Google Sheets renders multi-line cells natively.
      Description: task.description ?? '',
      ID: task.id ?? '',
      'Updated At': this.toISODate(task.updatedAt) || new Date().toISOString(),
    };
    return SHEET_HEADERS.map((h) => row[h]);
  }

  /**
   * Convert a sheet row back into a partial Task suitable for Firestore.
   * Does not include the Firestore document ID — callers decide whether to
   * create a new doc or merge into an existing one.
   *
   * `order` IS included here since users can now explicitly set per-section
   * ordering in the sheet. Callers that don't want updates to reorder tasks
   * should strip `order` from the result.
   */
  public transformFromSheetRow(
    row: string[],
    projectId: string,
    spreadsheetId: string,
    sections: Section[],
  ): { id: string; data: Partial<Task> } {
    const cell = (name: SheetColumn) => (row[headerIndex(name)] ?? '').toString();

    const id = cell('ID').trim();
    const status = this.parseStatus(cell('Status'));
    const data: Partial<Task> = {
      title: cell('Title') || 'Untitled',
      description: cell('Description') || '',
      status,
      priority: this.parsePriority(cell('Priority')),
      assigneeNames: cell('Assignees')
        ? cell('Assignees')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      tags: cell('Tags')
        ? cell('Tags')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      projectId,
      googleSheetId: spreadsheetId,
      isGoogleSheetTask: true,
    };
    // Only include googleSheetRowId when the sheet actually has an ID;
    // Firestore rejects `undefined` field values.
    if (id) data.googleSheetRowId = id;

    const due = this.parseDate(cell('Due Date'));
    if (due) data.dueDate = due;

    // Parse Order as a non-negative integer. Left undefined when blank so
    // callers (sync's create path) can assign a row-index-based default.
    const orderCell = cell('Order').trim();
    if (orderCell) {
      const parsed = Number(orderCell);
      if (Number.isFinite(parsed)) data.order = Math.max(0, Math.trunc(parsed));
    }

    // Map Section column to a sectionId. Accepts section name (default),
    // section ID (backward-compat with the old schema), or blank.
    const sectionCell = cell('Section').trim();
    if (sectionCell) {
      const byName = sections.find(
        (s) => s.name.toLowerCase() === sectionCell.toLowerCase(),
      );
      const byId = sections.find((s) => s.id === sectionCell);
      const matched = byName || byId;
      if (matched) data.sectionId = matched.id;
    }
    // Fall back to mapping from status if no section specified.
    if (!data.sectionId) {
      const byStatus = sections.find((s) => s.status === status);
      if (byStatus) data.sectionId = byStatus.id;
    }
    // Final fallback: drop the task into the project's first section (by order),
    // so hand-entered rows with only a title still land somewhere sensible.
    if (!data.sectionId && sections.length > 0) {
      const firstSection = [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
      if (firstSection) data.sectionId = firstSection.id;
    }

    return { id, data: this.stripUndefined(data) };
  }

  /**
   * Return a copy of the object with all `undefined` values removed.
   * Firestore rejects `undefined` field values, so any payload fed to
   * addDoc/updateDoc/batch.set must go through this.
   */
  private stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
    const result: Partial<T> = {};
    for (const key of Object.keys(obj) as Array<keyof T>) {
      if (obj[key] !== undefined) result[key] = obj[key];
    }
    return result;
  }

  /**
   * Escape and quote a sheet tab name for use in A1-notation ranges.
   * A1 syntax requires tab names with spaces or special chars to be wrapped
   * in single quotes, with embedded single quotes doubled — e.g.
   *   "Tasks"            -> "Tasks"
   *   "Sprint Backlog"   -> "'Sprint Backlog'"
   *   "Joe's Tasks"      -> "'Joe''s Tasks'"
   * The simple-alphanumeric shortcut keeps the common case readable.
   */
  private quoteTabName(tabName: string): string {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tabName)) return tabName;
    return `'${tabName.replace(/'/g, "''")}'`;
  }

  /** Build an A1 range string like `'Sprint Backlog'!A1:J` for a given tab. */
  private range(tabName: string, cells: string): string {
    return `${this.quoteTabName(tabName)}!${cells}`;
  }

  /**
   * Ensure the target tab has our header row in row 1. Idempotent.
   */
  async ensureHeaders(spreadsheetId: string, tabName: string): Promise<void> {
    const range = this.range(tabName, `A1:${this.columnLetter(SHEET_HEADERS.length)}1`);
    await firstValueFrom(
      this.sheetsService.updateValues(spreadsheetId, range, [Array.from(SHEET_HEADERS)]),
    );
  }

  /**
   * Read the tab's current row 1 and compare it against SHEET_HEADERS.
   * Returns true only when every column matches in order. Used to detect
   * sheets created under an older column layout so we can rewrite them.
   */
  private async headersMatchCurrentSchema(
    spreadsheetId: string,
    tabName: string,
  ): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.sheetsService.getValues(
          spreadsheetId,
          this.range(tabName, `A1:${this.columnLetter(SHEET_HEADERS.length)}1`),
        ),
      );
      const row = resp.values?.[0] ?? [];
      if (row.length !== SHEET_HEADERS.length) return false;
      for (let i = 0; i < SHEET_HEADERS.length; i++) {
        if ((row[i] ?? '').toString().trim() !== SHEET_HEADERS[i]) return false;
      }
      return true;
    } catch {
      // If we can't read the header row, assume mismatch so the caller rewrites.
      return false;
    }
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
    const sections = await this.getProjectSections(projectId);
    const tasks = await this.getProjectTasks(projectId);

    // Clear the existing data region (everything below the header row).
    const lastCol = this.columnLetter(SHEET_HEADERS.length);
    await firstValueFrom(
      this.sheetsService.clearValues(spreadsheetId, this.range(tabName, `A2:${lastCol}`)),
    );

    if (tasks.length === 0) {
      return { pushed: 0 };
    }

    const rows = tasks.map((t) => this.transformToSheetRow(t, sections));
    await firstValueFrom(
      this.sheetsService.updateValues(
        spreadsheetId,
        this.range(tabName, `A2:${lastCol}${1 + rows.length}`),
        rows,
      ),
    );

    // Mark each task with its sheet linkage for future syncs, in one atomic batch.
    await this.commitInBatches(tasks, (batch, t) => {
      batch.update(doc(this.firestore, `tasks/${t.id}`), {
        googleSheetId: spreadsheetId,
        googleSheetRowId: t.id,
        isGoogleSheetTask: true,
        updatedAt: new Date(),
      });
    });

    return { pushed: rows.length };
  }

  /**
   * Run the given builder against one or more writeBatch()es, respecting
   * Firestore's 500-op-per-batch hard limit. Each batch is committed independently.
   */
  private async commitInBatches<T>(
    items: T[],
    build: (batch: ReturnType<typeof writeBatch>, item: T) => void,
    chunkSize = 450,
  ): Promise<void> {
    for (let i = 0; i < items.length; i += chunkSize) {
      const slice = items.slice(i, i + chunkSize);
      const batch = writeBatch(this.firestore);
      for (const item of slice) {
        build(batch, item);
      }
      await batch.commit();
    }
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
    // Schema migration: if the sheet's row 1 doesn't match the current
    // SHEET_HEADERS layout, OmniTask's schema has evolved since this sheet
    // was created. Do a full rewrite (push) so both headers and data end up
    // in the new format before returning. Tasks currently in the sheet under
    // the old layout will already have been imported into Firestore on prior
    // syncs, so rewriting from the Firestore source-of-truth is safe.
    const schemaCurrent = await this.headersMatchCurrentSchema(spreadsheetId, tabName);
    if (!schemaCurrent) {
      const { pushed } = await this.pushProjectToSheet(projectId, spreadsheetId, tabName);
      return { added: 0, updated: 0, pushed };
    }

    await this.ensureHeaders(spreadsheetId, tabName);

    const sections = await this.getProjectSections(projectId);
    const existingTasks = await this.getProjectTasks(projectId);
    const tasksById = new Map(existingTasks.map((t) => [t.id, t]));

    const lastCol = this.columnLetter(SHEET_HEADERS.length);
    const valuesResp = await firstValueFrom(
      this.sheetsService.getValues(spreadsheetId, this.range(tabName, `A2:${lastCol}`)),
    );
    const sheetRows = valuesResp.values ?? [];

    const seenTaskIds = new Set<string>();

    // Classify each row before writing anything. Use pre-generated Firestore IDs for
    // new tasks so we can set() them inside a writeBatch() and batch the sheet
    // writebacks in a single API call.
    interface UpdateOp {
      kind: 'update';
      id: string;
      data: Partial<Task>;
    }
    interface CreateOp {
      kind: 'create';
      id: string;
      sheetRowIndex: number; // 1-based sheet row (header offset already applied)
      data: Partial<Task>;
    }
    const ops: Array<UpdateOp | CreateOp> = [];


    for (let i = 0; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      // Title is the only required field. Rows without a title are skipped so
      // stray blank lines (or lines with only an ID) don't create empty tasks.
      const titleIdx = headerIndex('Title');
      const hasTitle = !!(row && row[titleIdx] && row[titleIdx].toString().trim());
      if (!hasTitle) continue;

      const parsed = this.transformFromSheetRow(row, projectId, spreadsheetId, sections);
      const existing = parsed.id ? tasksById.get(parsed.id) : undefined;

      if (existing) {
        seenTaskIds.add(existing.id);
        // Updates deliberately omit `order` — that's owned by OmniTask's UI,
        // and re-syncing would otherwise clobber user-driven reordering.
        ops.push({
          kind: 'update',
          id: existing.id,
          data: { ...parsed.data, googleSheetRowId: existing.id },
        });
      } else {
        const newRef = doc(this.tasksCollection);
        seenTaskIds.add(newRef.id);
        ops.push({
          kind: 'create',
          id: newRef.id,
          sheetRowIndex: i + 2, // +2 = header row + 1-indexed
          // Seed `order` from the row index so the imported tasks preserve
          // the sheet's sequence in list/board views on first render.
          data: { ...parsed.data, googleSheetRowId: newRef.id, order: i },
        });
      }
    }

    // Append any OmniTask tasks that aren't in the sheet yet (pure-push leg).
    const missingTasks = existingTasks.filter((t) => !seenTaskIds.has(t.id));

    // --- Commit Firestore writes in chunked batches ---
    const now = new Date();
    await this.commitInBatches(ops, (batch, op) => {
      if (op.kind === 'update') {
        batch.update(doc(this.firestore, `tasks/${op.id}`), {
          ...op.data,
          updatedAt: now,
        });
      } else {
        batch.set(doc(this.firestore, `tasks/${op.id}`), {
          ...op.data,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    await this.commitInBatches(missingTasks, (batch, t) => {
      batch.update(doc(this.firestore, `tasks/${t.id}`), {
        googleSheetId: spreadsheetId,
        googleSheetRowId: t.id,
        isGoogleSheetTask: true,
      });
    });

    // --- Batch the sheet side-effects into at most two API calls ---
    // 1. Write back the FULL row for each newly-created task so any defaults
    //    OmniTask filled in (ID, priority=low, first-section fallback, updatedAt)
    //    are visible in the sheet instead of just the generated ID.
    const writebacks: BatchUpdateValuesData[] = ops
      .filter((o): o is CreateOp => o.kind === 'create')
      .map((o) => {
        const taskForRow: Task = {
          id: o.id,
          createdAt: now,
          updatedAt: now,
          title: '',
          description: '',
          status: 'todo',
          priority: 'low',
          order: 0,
          projectId,
          ...(o.data as Partial<Task>),
        } as Task;
        return {
          range: this.range(tabName, `A${o.sheetRowIndex}:${lastCol}${o.sheetRowIndex}`),
          values: [this.transformToSheetRow(taskForRow, sections)],
        };
      });
    if (writebacks.length > 0) {
      await firstValueFrom(
        this.sheetsService.batchUpdateValues(spreadsheetId, writebacks),
      );
    }

    // 2. Append rows for tasks that weren't yet in the sheet.
    let pushed = 0;
    if (missingTasks.length > 0) {
      const appendRows = missingTasks.map((t) => this.transformToSheetRow(t, sections));
      await firstValueFrom(
        this.sheetsService.appendValues(
          spreadsheetId,
          this.range(tabName, `A1:${lastCol}1`),
          appendRows,
        ),
      );
      pushed = missingTasks.length;
    }

    const added = ops.filter((o) => o.kind === 'create').length;
    const updated = ops.filter((o) => o.kind === 'update').length;
    return { added, updated, pushed };
  }

  /**
   * Create a new spreadsheet for the project and link it.
   *
   * @param projectId  OmniTask project to link.
   * @param projectName  Used to derive a default file title if one is not provided.
   * @param options  Optional overrides for the new file/worksheet names.
   * @returns The new spreadsheet's ID, URL, and resolved tab name on success.
   */
  async createSheetForProject(
    projectId: string,
    projectName: string,
    options: { title?: string; tabName?: string } = {},
  ): Promise<{ spreadsheetId: string; spreadsheetUrl: string; tabName: string }> {
    const title = (options.title ?? '').trim() || `${projectName} — OmniTask`;
    const desiredTab = (options.tabName ?? '').trim() || DEFAULT_SHEET_TAB_NAME;
    const resp = await firstValueFrom(
      this.sheetsService.createSpreadsheet(title, desiredTab),
    );
    const spreadsheetId = resp.spreadsheetId;
    const tabName = resp.sheets?.[0]?.properties?.title ?? desiredTab;
    const sheetId = resp.sheets?.[0]?.properties?.sheetId ?? 0;

    await this.ensureHeaders(spreadsheetId, tabName);

    // Apply Google Sheets' native Table format on top of the header row.
    // Tables give the user filter/sort chips out of the box and let us declare
    // per-column types (text / number / date / dropdown) so the UI validates
    // inputs like Section, Status, and Priority at edit-time.
    const sections = await this.getProjectSections(projectId);
    try {
      await firstValueFrom(
        this.sheetsService.batchUpdateSheet(
          spreadsheetId,
          this.buildAddTableRequests(sheetId, tabName, sections),
        ),
      );
    } catch (err) {
      // Non-fatal: if the host account doesn't have Tables enabled we still
      // have a usable header-row spreadsheet and sync will work. Log and move on.
      console.warn('Could not apply native Sheets Table format:', err);
    }

    await updateDoc(doc(this.firestore, `projects/${projectId}`), {
      googleSheetId: spreadsheetId,
      googleSheetName: resp.properties.title,
      googleSheetTabName: tabName,
      sheetSyncEnabled: true,
      sheetSyncStatus: 'pending',
    });

    return { spreadsheetId, spreadsheetUrl: resp.spreadsheetUrl, tabName };
  }

  /**
   * Build the addTable + data-validation requests that turn the bare tab
   * into a typed Sheets Table. The table covers the header row plus a large
   * pre-allocated block of data rows so subsequent appends stay inside the
   * table boundary.
   *
   * @param sheetId   Numeric sheet tab ID (distinct from the tab NAME).
   * @param tabName   Tab name (used only in the table's user-facing name).
   * @param sections  Project sections — their names become the Section dropdown options.
   */
  private buildAddTableRequests(
    sheetId: number,
    tabName: string,
    sections: Section[],
  ): Array<Record<string, unknown>> {
    const TABLE_ROW_CAPACITY = 1000; // header + ~999 data rows pre-allocated
    const endRowIndex = 1 + TABLE_ROW_CAPACITY;

    // Build one columnProperties entry per header. Columns with a
    // fixed-choice domain get DROPDOWN + a ONE_OF_LIST validation rule so
    // Sheets renders a proper chip/picker in each cell.
    const dropdownChoice = (
      values: string[],
    ): { type: 'ONE_OF_LIST'; values: Array<{ userEnteredValue: string }> } => ({
      type: 'ONE_OF_LIST',
      values: values.map((v) => ({ userEnteredValue: v })),
    });

    const columnProperties = SHEET_HEADERS.map((name, idx) => {
      const base = { columnIndex: idx, columnName: name };
      switch (name) {
        case 'Section':
          return {
            ...base,
            columnType: 'DROPDOWN',
            dataValidationRule: {
              condition: dropdownChoice(
                sections.length > 0 ? sections.map((s) => s.name) : ['To Do'],
              ),
              strict: false,
              showCustomUi: true,
            },
          };
        case 'Status':
          return {
            ...base,
            columnType: 'DROPDOWN',
            dataValidationRule: {
              condition: dropdownChoice(['todo', 'in-progress', 'done']),
              strict: false,
              showCustomUi: true,
            },
          };
        case 'Priority':
          return {
            ...base,
            columnType: 'DROPDOWN',
            dataValidationRule: {
              condition: dropdownChoice(['low', 'medium', 'high']),
              strict: false,
              showCustomUi: true,
            },
          };
        case 'Order':
          return { ...base, columnType: 'DOUBLE' };
        case 'Due Date':
          return { ...base, columnType: 'DATE' };
        case 'Updated At':
          return { ...base, columnType: 'DATE_TIME' };
        default:
          return { ...base, columnType: 'TEXT' };
      }
    });

    return [
      {
        addTable: {
          table: {
            name: `${tabName} — OmniTask Tasks`,
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex,
              startColumnIndex: 0,
              endColumnIndex: SHEET_HEADERS.length,
            },
            columnProperties,
          },
        },
      },
    ];
  }

  /**
   * Find the 1-based sheet row index for a task ID by scanning column A.
   * Returns null when the ID isn't present (treat as "not in sheet yet").
   */
  private async findRowIndex(
    spreadsheetId: string,
    tabName: string,
    taskId: string,
  ): Promise<number | null> {
    // ID lives in whichever column SHEET_HEADERS currently places it.
    const idCol = this.columnLetter(headerIndex('ID') + 1);
    const resp = await firstValueFrom(
      this.sheetsService.getValues(
        spreadsheetId,
        this.range(tabName, `${idCol}2:${idCol}`),
      ),
    );
    const rows = resp.values ?? [];
    for (let i = 0; i < rows.length; i++) {
      const cell = (rows[i]?.[0] ?? '').toString().trim();
      if (cell === taskId) return i + 2; // +2: header row + 1-indexed
    }
    return null;
  }

  /**
   * Push a single task to the project's linked sheet. Inserts a new row if
   * the task isn't already present, or replaces the existing row in place.
   *
   * Best-effort: authentication errors and missing-sheet errors are swallowed
   * so they don't break the calling task-save flow. The caller gets `false`
   * in that case and a warning is logged.
   */
  async pushTaskUpsert(task: Task, project: Project): Promise<boolean> {
    const spreadsheetId = project.googleSheetId;
    if (!spreadsheetId) return false;
    if (!this.sheetsService.isAuthenticated()) return false;
    const tabName = project.googleSheetTabName || DEFAULT_SHEET_TAB_NAME;
    const lastCol = this.columnLetter(SHEET_HEADERS.length);
    try {
      const rowValues = this.transformToSheetRow(task, project.sections ?? []);
      const existingRow = await this.findRowIndex(spreadsheetId, tabName, task.id);
      if (existingRow !== null) {
        await firstValueFrom(
          this.sheetsService.updateValues(
            spreadsheetId,
            this.range(tabName, `A${existingRow}:${lastCol}${existingRow}`),
            [rowValues],
          ),
        );
      } else {
        await firstValueFrom(
          this.sheetsService.appendValues(
            spreadsheetId,
            this.range(tabName, `A1:${lastCol}1`),
            [rowValues],
          ),
        );
      }
      return true;
    } catch (err) {
      console.warn('Google Sheets push failed for task', task.id, err);
      return false;
    }
  }

  /**
   * Remove a task's row from the project's linked sheet. No-op if the sheet
   * doesn't contain the task.
   */
  async pushTaskDelete(task: Task, project: Project): Promise<boolean> {
    const spreadsheetId = project.googleSheetId;
    if (!spreadsheetId) return false;
    if (!this.sheetsService.isAuthenticated()) return false;
    const tabName = project.googleSheetTabName || DEFAULT_SHEET_TAB_NAME;
    const lastCol = this.columnLetter(SHEET_HEADERS.length);
    try {
      const existingRow = await this.findRowIndex(spreadsheetId, tabName, task.id);
      if (existingRow === null) return false;
      // Clear the row's cells rather than physically removing the row, since
      // shifting rows would require a spreadsheets.batchUpdate with a delete
      // request and the tab's numeric sheetId. Clearing is atomic from the
      // user's perspective — the row reappears empty and can be reused.
      await firstValueFrom(
        this.sheetsService.clearValues(
          spreadsheetId,
          this.range(tabName, `A${existingRow}:${lastCol}${existingRow}`),
        ),
      );
      return true;
    } catch (err) {
      console.warn('Google Sheets delete-push failed for task', task.id, err);
      return false;
    }
  }
}
