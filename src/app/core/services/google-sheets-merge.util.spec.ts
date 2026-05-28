import {
  dataSheetCellsMatch,
  mergeSheetRowFieldLevel,
} from './google-sheets-merge.util';
import { SHEET_HEADERS } from './google-sheets.constants';

function makeRow(values: Partial<Record<(typeof SHEET_HEADERS)[number], string>>): string[] {
  return SHEET_HEADERS.map((header) => values[header] ?? '');
}

describe('google-sheets-merge.util', () => {
  describe('mergeSheetRowFieldLevel', () => {
    it('preserves concurrent edits to different columns', () => {
      const lastSynced = makeRow({
        Title: 'Original',
        Priority: 'low',
        Status: 'todo',
        ID: 'task-1',
      });
      const expected = makeRow({
        Title: 'Original',
        Priority: 'high',
        Status: 'todo',
        ID: 'task-1',
      });
      const sheetRow = makeRow({
        Title: 'Sheet title',
        Priority: 'low',
        Status: 'todo',
        ID: 'task-1',
      });

      const merged = mergeSheetRowFieldLevel({
        sheetRow,
        expectedRow: expected,
        lastSyncedRow: lastSynced,
        conflictPreference: 'app',
      });

      expect(merged[SHEET_HEADERS.indexOf('Title')]).toBe('Sheet title');
      expect(merged[SHEET_HEADERS.indexOf('Priority')]).toBe('high');
    });

    it('prefers app on conflict when conflictPreference is app', () => {
      const lastSynced = makeRow({ Title: 'Original', Priority: 'low', ID: 'task-1' });
      const expected = makeRow({ Title: 'App title', Priority: 'high', ID: 'task-1' });
      const sheetRow = makeRow({ Title: 'Sheet title', Priority: 'medium', ID: 'task-1' });

      const merged = mergeSheetRowFieldLevel({
        sheetRow,
        expectedRow: expected,
        lastSyncedRow: lastSynced,
        conflictPreference: 'app',
      });

      expect(merged[SHEET_HEADERS.indexOf('Title')]).toBe('App title');
      expect(merged[SHEET_HEADERS.indexOf('Priority')]).toBe('high');
    });

    it('prefers sheet on conflict when conflictPreference is sheet', () => {
      const lastSynced = makeRow({ Title: 'Original', Priority: 'low', ID: 'task-1' });
      const expected = makeRow({ Title: 'App title', Priority: 'high', ID: 'task-1' });
      const sheetRow = makeRow({ Title: 'Sheet title', Priority: 'medium', ID: 'task-1' });

      const merged = mergeSheetRowFieldLevel({
        sheetRow,
        expectedRow: expected,
        lastSyncedRow: lastSynced,
        conflictPreference: 'sheet',
      });

      expect(merged[SHEET_HEADERS.indexOf('Title')]).toBe('Sheet title');
      expect(merged[SHEET_HEADERS.indexOf('Priority')]).toBe('medium');
    });

    it('returns expected row when only the app changed', () => {
      const lastSynced = makeRow({ Title: 'Original', Priority: 'low', ID: 'task-1' });
      const expected = makeRow({ Title: 'Original', Priority: 'high', ID: 'task-1' });
      const sheetRow = makeRow({ Title: 'Original', Priority: 'low', ID: 'task-1' });

      const merged = mergeSheetRowFieldLevel({
        sheetRow,
        expectedRow: expected,
        lastSyncedRow: lastSynced,
        conflictPreference: 'app',
      });

      expect(dataSheetCellsMatch(merged, expected)).toBeTrue();
    });
  });
});
