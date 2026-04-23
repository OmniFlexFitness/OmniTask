import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { DEFAULT_VERSION } from '../constants';

@Injectable({
  providedIn: 'root'
})
export class VersionService {
  private http = inject(HttpClient);

  getVersion(): Observable<string> {
    return this.http.get<{ version: string }>('/version.json').pipe(
      map(data => data.version),
      catchError(() => of(DEFAULT_VERSION))
    );
  }
}
