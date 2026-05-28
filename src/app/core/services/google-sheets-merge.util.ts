import { SHEET_HEADERS, sheetHeaderIndex } from './google-sheets.constants';

/** 0-based indices of user-editable columns (excludes ID and Updated At). */
export function editableColumnIndices(): number[] {
  const skip = new Set([sheetHeaderIndex('ID'), sheetHeaderIndex('Updated At')]);
  const out: number[] = [];
  for (let i = 0; i < SHEET_HEADERS.length; i++) {
    if (!skip.has(i)) out.push(i);
  }
  return out;
}

/** Compare editable cells only, ignoring ID and Updated At. */
export function dataSheetCellsMatch(a: string[], b: string[]): boolean {
  const skip = new Set([sheetHeaderIndex('ID'), sheetHeaderIndex('Updated At')]);
  for (let i = 0; i < SHEET_HEADERS.length; i++) {
    if (skip.has(i)) continue;
    const av = (a[i] ?? '').toString();
    const bv = (b[i] ?? '').toString();
    if (av !== bv) return false;
  }
  return true;
}

export type SheetMergeConflictPreference = 'app' | 'sheet';

/**
 * Merge a sheet row with the app's expected row using a last-synced snapshot.
 * Per-field winners when only one side changed; on conflict, use conflictPreference.
 */
export function mergeSheetRowFieldLevel(options: {
  sheetRow: string[];
  expectedRow: string[];
  lastSyncedRow: string[];
  conflictPreference: SheetMergeConflictPreference;
}): string[] {
  const { sheetRow, expectedRow, lastSyncedRow, conflictPreference } = options;
  const merged = [...expectedRow];
  for (const idx of editableColumnIndices()) {
    const sheetVal = (sheetRow[idx] ?? '').toString();
    const expectedVal = (expectedRow[idx] ?? '').toString();
    const lastVal = (lastSyncedRow[idx] ?? '').toString();
    const sheetChanged = sheetVal !== lastVal;
    const appChanged = expectedVal !== lastVal;

    if (sheetChanged && !appChanged) {
      merged[idx] = sheetVal;
    } else if (sheetChanged && appChanged) {
      merged[idx] = conflictPreference === 'app' ? expectedVal : sheetVal;
    }
  }
  return merged;
}
