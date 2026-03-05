import { TestBed } from '@angular/core/testing';
import { VersionService } from './version.service';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { DEFAULT_VERSION } from '../constants'; // Assumes exported DEFAULT_VERSION

export const mockVersionTracking = {
  urlCalled: '',
};

describe('VersionService', () => {
  let service: VersionService;

  const mockHttpClient = {
    get: (url: string) => {
      mockVersionTracking.urlCalled = url;
      return of({ version: '1.2.3' });
    },
  };

  beforeEach(() => {
    mockVersionTracking.urlCalled = '';
    TestBed.configureTestingModule({
      providers: [VersionService, { provide: HttpClient, useValue: mockHttpClient }],
    });
    service = TestBed.inject(VersionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return version from http call when successful', () => {
    mockHttpClient.get = (url: string) => {
      mockVersionTracking.urlCalled = url;
      return of({ version: '1.2.3' });
    };

    service.getVersion().subscribe((version) => {
      expect(version).toBe('1.2.3');
      expect(mockVersionTracking.urlCalled).toBe('/version.json');
    });
  });

  it('should return DEFAULT_VERSION when http call fails', () => {
    mockHttpClient.get = () => throwError(() => new Error('Network error'));

    service.getVersion().subscribe((version) => {
      expect(version).toBe(DEFAULT_VERSION);
    });
  });
});
