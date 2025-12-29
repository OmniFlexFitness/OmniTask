import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class VersionService {
  private http = inject(HttpClient);
  private version: string = '0.0.01'; // Default version

  getVersion(): Observable<string> {
    return this.http.get<{ version: string }>('/version.json').pipe(
      map(data => data.version),
      catchError(() => of(this.version))
    );
  }
}
