import { Injectable, inject, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
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
    return new Observable<SpreadsheetMetadata>((observer) => {
      this.http.get<any>(url, { headers: this.getAuthHeaders() }).subscribe({
        next: (raw) => {
          const meta: SpreadsheetMetadata = {
            spreadsheetId: raw.spreadsheetId,
            title: raw.properties?.title ?? 'Untitled',
            spreadsheetUrl: raw.spreadsheetUrl,
            sheets: (raw.sheets || []).map((s: any) => ({
              sheetId: s.properties?.sheetId,
              title: s.properties?.title,
              index: s.properties?.index,
            })),
          };
          observer.next(meta);
          observer.complete();
        },
        error: (err) => observer.error(err),
      });
    });
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
