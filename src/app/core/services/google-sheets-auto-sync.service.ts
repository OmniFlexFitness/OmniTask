import { Injectable, inject, signal, computed } from '@angular/core';
import { ProjectService } from './project.service';
import { GoogleSheetsService } from './google-sheets.service';
import {
  GoogleSheetsSyncService,
  SheetSyncResult,
  DEFAULT_SHEET_TAB_NAME,
} from './google-sheets-sync.service';

/**
 * Interval between background pulls when the project view is open. Short enough
 * that sheet edits surface quickly; long enough not to burn the Sheets API quota.
 */
const POLL_INTERVAL_MS = 60_000;

/**
 * Minimum gap between consecutive syncs. Prevents rapid-fire triggers (e.g.
 * multiple components mounting, or a CRUD burst) from running overlapping syncs.
 */
const SYNC_DEBOUNCE_MS = 5_000;

/**
 * Orchestrates persistent background sync between the currently-open project
 * and its linked Google Sheet.
 *
 *   - `start(projectId)` kicks off an immediate sync and a polling loop.
 *   - `stop()` tears the loop down.
 *   - `syncNow()` runs one sync on demand (e.g. after a user-driven task CRUD).
 *
 * All error paths are swallowed and surfaced via the `lastError` signal so
 * callers can render them without crashing the task view.
 */
@Injectable({ providedIn: 'root' })
export class GoogleSheetsAutoSyncService {
  private readonly projectService = inject(ProjectService);
  private readonly sheetsService = inject(GoogleSheetsService);
  private readonly sheetsSync = inject(GoogleSheetsSyncService);

  // The project the current view has asked us to watch. Null when nothing is active.
  private readonly activeProjectId = signal<string | null>(null);

  // Reactive state consumed by the UI.
  readonly syncing = signal(false);
  readonly lastSyncAt = signal<Date | null>(null);
  readonly lastError = signal<string | null>(null);
  readonly lastResult = signal<SheetSyncResult | null>(null);

  readonly isActive = computed(() => this.activeProjectId() !== null);

  // Internal scheduling state.
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSyncStartedAt = 0;
  private inflight: Promise<SheetSyncResult | null> | null = null;

  /**
   * Begin polling the given project's sheet. Safe to call repeatedly — if the
   * project is the same, it's a no-op; if it's different, the previous timer
   * is torn down first.
   */
  start(projectId: string): void {
    if (this.activeProjectId() === projectId && this.pollTimer !== null) return;
    this.stop();
    this.activeProjectId.set(projectId);
    // Fire an initial sync (don't await — we want start() to be non-blocking).
    void this.syncNow();
    this.pollTimer = setInterval(() => {
      void this.syncNow();
    }, POLL_INTERVAL_MS);
  }

  /** Stop any active polling loop and clear the active-project marker. */
  stop(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.activeProjectId.set(null);
  }

  /**
   * Run a single sync for the active project (or for an explicitly supplied
   * project ID). Deduplicates overlapping calls and honors a short debounce
   * so bursts of task CRUD don't trigger N syncs back-to-back.
   */
  async syncNow(projectId?: string): Promise<SheetSyncResult | null> {
    const id = projectId ?? this.activeProjectId();
    if (!id) return null;
    if (!this.sheetsService.isAuthenticated()) return null;

    // Return the in-flight promise if one is already running for this project.
    if (this.inflight) return this.inflight;

    const now = Date.now();
    if (now - this.lastSyncStartedAt < SYNC_DEBOUNCE_MS) {
      return this.lastResult();
    }
    this.lastSyncStartedAt = now;

    this.inflight = (async () => {
      this.syncing.set(true);
      this.lastError.set(null);
      try {
        const project = await this.projectService.getProject(id);
        if (!project?.googleSheetId) return null;
        const tab = project.googleSheetTabName || DEFAULT_SHEET_TAB_NAME;
        const result = await this.sheetsSync.syncProjectWithSheet(
          id,
          project.googleSheetId,
          tab,
        );
        this.lastResult.set(result);
        this.lastSyncAt.set(new Date());
        // Best-effort status write back to the project doc so the UI reflects
        // the auto-sync outcome without each caller having to duplicate this.
        try {
          await this.projectService.updateProject(id, {
            sheetSyncStatus: 'synced',
            lastSheetSyncAt: new Date(),
          });
        } catch {
          // Non-fatal: the sync itself succeeded.
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sheet sync failed';
        this.lastError.set(message);
        try {
          await this.projectService.updateProject(id, { sheetSyncStatus: 'error' });
        } catch {
          // Non-fatal.
        }
        return null;
      } finally {
        this.syncing.set(false);
        this.inflight = null;
      }
    })();

    return this.inflight;
  }

  /**
   * Trigger an immediate sync after a task was created/updated/deleted, with
   * the debounce bypassed so user-driven changes show up in the sheet quickly.
   * Errors are swallowed (surfaced via the `lastError` signal).
   */
  async syncAfterChange(projectId: string): Promise<void> {
    if (!this.sheetsService.isAuthenticated()) return;
    if (this.inflight) {
      // A sync is already running — it will pick up the change.
      return;
    }
    // Reset debounce so the change syncs immediately even if another one just ran.
    this.lastSyncStartedAt = 0;
    try {
      await this.syncNow(projectId);
    } catch {
      // Non-fatal — already surfaced via lastError.
    }
  }
}
