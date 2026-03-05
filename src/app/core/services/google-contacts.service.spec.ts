import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import {
  GoogleContactsService,
  GooglePeopleResponse,
  GoogleDirectoryResponse,
} from './google-contacts.service';
import { AuthService } from '../auth/auth.service';
import { signal } from '@angular/core';

describe('GoogleContactsService', () => {
  let service: GoogleContactsService;
  let httpMock: HttpTestingController;
  let mockAuthService: jasmine.SpyObj<AuthService>;

  const mockToken = 'mock-oauth-token';
  const PEOPLE_API = 'https://people.googleapis.com/v1';
  const ADMIN_API = 'https://admin.googleapis.com/admin/directory/v1';

  beforeEach(() => {
    mockAuthService = jasmine.createSpyObj('AuthService', [], {
      googleTasksAccessToken: signal(mockToken),
    });

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [GoogleContactsService, { provide: AuthService, useValue: mockAuthService }],
    });

    service = TestBed.inject(GoogleContactsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
    expect(service.isAuthenticated()).toBeTrue();
  });

  describe('Unauthenticated behavior', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const unauthAuthService = jasmine.createSpyObj('AuthService', [], {
        googleTasksAccessToken: signal(null),
      });

      TestBed.configureTestingModule({
        imports: [HttpClientTestingModule],
        providers: [GoogleContactsService, { provide: AuthService, useValue: unauthAuthService }],
      });

      service = TestBed.inject(GoogleContactsService);
    });

    it('should return empty arrays when not authenticated', (done) => {
      service.getContacts().subscribe((res) => {
        expect(res).toEqual([]);
        done();
      });
    });

    it('should handle searchContacts empty', (done) => {
      service.searchContacts('test').subscribe((res) => {
        expect(res).toEqual([]);
        done();
      });
    });

    it('should handle getOtherContacts empty', (done) => {
      service.getOtherContacts().subscribe((res) => {
        expect(res).toEqual([]);
        done();
      });
    });

    it('should handle getDirectoryPeople empty', (done) => {
      service.getDirectoryPeople().subscribe((res) => {
        expect(res).toEqual([]);
        done();
      });
    });

    it('should handle searchDirectoryPeople empty', (done) => {
      service.searchDirectoryPeople('test').subscribe((res) => {
        expect(res).toEqual([]);
        done();
      });
    });

    it('should handle getDomainUsers empty', (done) => {
      service.getDomainUsers().subscribe((res) => {
        expect(res).toEqual([]);
        done();
      });
    });
  });

  describe('Authenticated HTTP calls', () => {
    it('should fetch and map standard contacts', () => {
      const mockResponse: GooglePeopleResponse = {
        connections: [
          {
            emailAddresses: [{ value: 'test@example.com', metadata: { primary: true } }],
            names: [{ displayName: 'Test User', metadata: { primary: true } }],
            photos: [{ url: 'http://photo.url', metadata: { primary: true } }],
          },
          {
            // Missing email should be skipped
            names: [{ displayName: 'No Email User' }],
          },
        ],
      };

      service.getContacts(10).subscribe((res) => {
        expect(res.length).toBe(1);
        expect(res[0].id).toBe('test@example.com');
        expect(res[0].displayName).toBe('Test User');
        expect(res[0].source).toBe('google-contacts');
      });

      const req = httpMock.expectOne({ method: 'GET' });
      expect(req.request.url.includes('/people/me/connections')).toBeTrue();
      req.flush(mockResponse);
    });

    it('should handle errors in getContacts gracefully', () => {
      service.getContacts().subscribe((res) => {
        expect(res).toEqual([]);
      });

      const req = httpMock.expectOne({ method: 'GET' });
      req.error(new ProgressEvent('network error'));
    });

    it('should fetch and map domain users', () => {
      const mockResponse: GoogleDirectoryResponse = {
        users: [
          {
            primaryEmail: 'admin@omniflex.com',
            name: { fullName: 'Admin User' },
            suspended: false,
          },
          {
            primaryEmail: 'suspended@omniflex.com',
            suspended: true,
          },
        ],
      };

      service.getDomainUsers('omniflex.com').subscribe((res) => {
        expect(res.length).toBe(1);
        expect(res[0].id).toBe('admin@omniflex.com');
        expect(res[0].source).toBe('google-directory');
      });

      const req = httpMock.expectOne({ method: 'GET' });
      expect(req.request.url.includes('/users')).toBeTrue();
      req.flush(mockResponse);
    });

    it('should handle errors in getDomainUsers gracefully', () => {
      service.getDomainUsers().subscribe((res) => {
        expect(res).toEqual([]);
      });

      const req = httpMock.expectOne({ method: 'GET' });
      req.error(new ProgressEvent('network error'));
    });

    it('should search contacts', () => {
      const mockResponse = {
        results: [
          {
            person: {
              emailAddresses: [{ value: 'search@example.com' }],
              names: [{ displayName: 'Search Res' }],
            },
          },
        ],
      };

      service.searchContacts('search').subscribe((res) => {
        expect(res.length).toBe(1);
        expect(res[0].id).toBe('search@example.com');
      });

      const req = httpMock.expectOne({ method: 'GET' });
      expect(req.request.url.includes(':searchContacts')).toBeTrue();
      req.flush(mockResponse);
    });

    it('should get other contacts', () => {
      const mockResponse = {
        otherContacts: [
          {
            emailAddresses: [{ value: 'other@example.com' }],
          },
        ],
      };

      service.getOtherContacts().subscribe((res) => {
        expect(res.length).toBe(1);
        expect(res[0].id).toBe('other@example.com');
      });

      const req = httpMock.expectOne({ method: 'GET' });
      expect(req.request.url.includes('/otherContacts')).toBeTrue();
      req.flush(mockResponse);
    });

    it('should get directory people', () => {
      const mockResponse = {
        people: [
          {
            emailAddresses: [{ value: 'dirperson@company.com' }],
          },
        ],
      };

      service.getDirectoryPeople().subscribe((res) => {
        expect(res.length).toBe(1);
        expect(res[0].id).toBe('dirperson@company.com');
        expect(res[0].source).toBe('google-directory');
      });

      const req = httpMock.expectOne({ method: 'GET' });
      expect(req.request.url.includes(':listDirectoryPeople')).toBeTrue();
      req.flush(mockResponse);
    });

    it('should search directory people', () => {
      const mockResponse = {
        people: [
          {
            emailAddresses: [{ value: 'searchdir@company.com' }],
          },
        ],
      };

      service.searchDirectoryPeople('dir').subscribe((res) => {
        expect(res.length).toBe(1);
        expect(res[0].id).toBe('searchdir@company.com');
      });

      const req = httpMock.expectOne({ method: 'GET' });
      expect(req.request.url.includes(':searchDirectoryPeople')).toBeTrue();
      req.flush(mockResponse);
    });
  });
});
