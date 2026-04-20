import { Injectable, inject, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';

export interface SheetTab {
  sheetId: number;
  title: string;
  index: number;
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl?: string;
  sheets: SheetTab[];
}

export interface ValuesResponse {
  range: string;
  majorDimension: 'ROWS' | 'COLUMNS';
  values?: string[][];
}

export interface UpdateValuesResponse {
  spreadsheetId: string;
  updatedRange: string;
  updatedRows?: number;
  updatedColumns?: number;
  updatedCells?: number;
}

export interface AppendValuesResponse {
  spreadsheetId: string;
  tableRange?: string;
  updates?: UpdateValuesResponse;
}

export interface CreateSpreadsheetResponse {
  spreadsheetId: string;
  spreadsheetUrl: string;
  properties: { title: string };
  sheets: Array<{ properties: { sheetId: number; title: string; index: number } }>;
}

/** Raw shape of the Sheets v4 spreadsheet GET response (fields-filtered). */
interface RawSpreadsheetResponse {
  spreadsheetId: string;
  spreadsheetUrl?: string;
  properties?: { title?: string };
  sheets?: Array<{
    properties?: { sheetId?: number; title?: string; index?: number };
  }>;
}

export interface BatchUpdateValuesData {
  range: string;
  values: (string | number | null)[][];
}

export interface BatchUpdateValuesResponse {
  spreadsheetId: string;
  totalUpdatedRanges?: number;
  totalUpdatedRows?: number;
  totalUpdatedCells?: number;
  responses?: UpdateValuesResponse[];
}

/**
 * A single request in a structural batchUpdate (spreadsheets:batchUpdate).
 * Typed loosely: the Sheets API supports dozens of request shapes and the
 * service consumer (GoogleSheetsSyncService) knows which shape it's building.
 */
export interface SheetBatchRequest {
  [requestType: string]: unknown;
}

export interface SheetBatchUpdateResponse {
  spreadsheetId: string;
  replies?: Array<Record<string, unknown>>;
}

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Thin wrapper around the Google Sheets REST API v4.
 * Mirrors the structure of GoogleTasksService.
 *
 * The OAuth token is shared with Google Tasks (same Firebase sign-in popup).
 * All requests authenticate with the in-memory access token on AuthService.
 */
@Injectable({ providedIn: 'root' })
export class GoogleSheetsService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  isAuthenticated = computed(() => !!this.authService.googleSheetsAccessToken());

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.googleSheetsAccessToken();
    if (!token) {
      throw new Error('Google Sheets not authenticated. Please sign in again.');
    }
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  /**
   * Parse a spreadsheet ID out of a Google Sheets URL, or return the string
   * unchanged if it already looks like an ID.
   * Example URL: https://docs.google.com/spreadsheets/d/1A2B3C.../edit
   */
  extractSpreadsheetId(urlOrId: string): string {
    const trimmed = (urlOrId || '').trim();
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : trimmed;
  }

  /**
   * Fetch spreadsheet metadata (title + list of sheet tabs).
   */
  getSpreadsheet(spreadsheetId: string): Observable<SpreadsheetMetadata> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Sheets not authenticated'));
    }
    const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties`;
    return this.http
      .get<RawSpreadsheetResponse>(url, { headers: this.getAuthHeaders() })
      .pipe(
        map((raw) => ({
          spreadsheetId: raw.spreadsheetId,
          title: raw.properties?.title ?? 'Untitled',
          spreadsheetUrl: raw.spreadsheetUrl,
          sheets: (raw.sheets ?? []).map((s) => ({
            sheetId: s.properties?.sheetId ?? 0,
            title: s.properties?.title ?? '',
            index: s.properties?.index ?? 0,
          })),
        })),
      );
  }

  /**
   * Create a new spreadsheet owned by the signed-in user.
   * The file is created under the drive.file scope so only OmniTask can access it.
   */
  createSpreadsheet(title: string, tabName = 'Tasks'): Observable<CreateSpreadsheetResponse> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Sheets not authenticated'));
    }
    const body = {
      properties: { title },
      sheets: [{ properties: { title: tabName } }],
    };
    return this.http.post<CreateSpreadsheetResponse>(SHEETS_API_BASE, body, {
      headers: this.getAuthHeaders(),
    });
  }

  /**
   * Read a range of values from a sheet.
   * Range uses A1 notation, e.g. "Tasks!A1:J" for all rows in columns A-J.
   */
  getValues(spreadsheetId: string, range: string): Observable<ValuesResponse> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Sheets not authenticated'));
    }
    const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
    return this.http.get<ValuesResponse>(url, { headers: this.getAuthHeaders() });
  }

  /**
   * Overwrite a range with the provided 2D value array.
   * Uses USER_ENTERED so formulas and dates parse correctly.
   */
  updateValues(
    spreadsheetId: string,
    range: string,
    values: (string | number | null)[][],
  ): Observable<UpdateValuesResponse> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Sheets not authenticated'));
    }
    const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    return this.http.put<UpdateValuesResponse>(
      url,
      { range, majorDimension: 'ROWS', values },
      { headers: this.getAuthHeaders() },
    );
  }

  /**
   * Append rows to the end of a sheet's table.
   */
  appendValues(
    spreadsheetId: string,
    range: string,
    values: (string | number | null)[][],
  ): Observable<AppendValuesResponse> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Sheets not authenticated'));
    }
    const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    return this.http.post<AppendValuesResponse>(
      url,
      { values },
      { headers: this.getAuthHeaders() },
    );
  }

  /**
   * Write multiple disjoint ranges in a single request via values:batchUpdate.
   * Far cheaper than calling updateValues() in a loop when touching many rows/cells.
   */
  batchUpdateValues(
    spreadsheetId: string,
    data: BatchUpdateValuesData[],
  ): Observable<BatchUpdateValuesResponse> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Sheets not authenticated'));
    }
    const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
    return this.http.post<BatchUpdateValuesResponse>(
      url,
      {
        valueInputOption: 'USER_ENTERED',
        data: data.map((d) => ({
          range: d.range,
          majorDimension: 'ROWS',
          values: d.values,
        })),
      },
      { headers: this.getAuthHeaders() },
    );
  }

  /**
   * Structural batchUpdate (spreadsheets:batchUpdate). Accepts a list of
   * request objects (e.g. addTable, addSheet, updateCells, setDataValidation)
   * and applies them atomically. Use this for operations that reshape the
   * spreadsheet itself rather than just cell values.
   */
  batchUpdateSheet(
    spreadsheetId: string,
    requests: SheetBatchRequest[],
  ): Observable<SheetBatchUpdateResponse> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Sheets not authenticated'));
    }
    const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
    return this.http.post<SheetBatchUpdateResponse>(
      url,
      { requests },
      { headers: this.getAuthHeaders() },
    );
  }

  /**
   * Clear all values in the given range (keeps formatting).
   */
  clearValues(spreadsheetId: string, range: string): Observable<{ clearedRange: string }> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Sheets not authenticated'));
    }
    const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`;
    return this.http.post<{ clearedRange: string }>(
      url,
      {},
      { headers: this.getAuthHeaders() },
    );
  }
}
