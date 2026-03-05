import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { GoogleTasksService, GoogleTask, GoogleTaskList } from './google-tasks.service';
import { AuthService } from '../auth/auth.service';
import { signal } from '@angular/core';

describe('GoogleTasksService', () => {
  let service: GoogleTasksService;
  let httpMock: HttpTestingController;
  let mockAuthService: jasmine.SpyObj<AuthService>;

  const mockToken = 'mock-oauth-token';
  const API_BASE = 'https://tasks.googleapis.com/tasks/v1';

  beforeEach(() => {
    mockAuthService = jasmine.createSpyObj('AuthService', [], {
      googleTasksAccessToken: signal(mockToken),
    });

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [GoogleTasksService, { provide: AuthService, useValue: mockAuthService }],
    });

    service = TestBed.inject(GoogleTasksService);
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
      // Create a fresh unauthenticated service instance
      TestBed.resetTestingModule();
      const unauthAuthService = jasmine.createSpyObj('AuthService', [], {
        googleTasksAccessToken: signal(null),
      });

      TestBed.configureTestingModule({
        imports: [HttpClientTestingModule],
        providers: [GoogleTasksService, { provide: AuthService, useValue: unauthAuthService }],
      });

      service = TestBed.inject(GoogleTasksService);
    });

    it('should fail getTaskLists', (done) => {
      service.getTaskLists().subscribe({
        error: (err) => {
          expect(err.message).toBe('Google Tasks not authenticated');
          done();
        },
      });
    });

    it('should fail createTaskList', (done) => {
      service.createTaskList('Title').subscribe({
        error: (err) => {
          expect(err.message).toBe('Google Tasks not authenticated');
          done();
        },
      });
    });

    it('should fail deleteTaskList', (done) => {
      service.deleteTaskList('listId').subscribe({
        error: (err) => {
          expect(err.message).toBe('Google Tasks not authenticated');
          done();
        },
      });
    });

    it('should fail getTasks', (done) => {
      service.getTasks('listId').subscribe({
        error: (err) => {
          expect(err.message).toBe('Google Tasks not authenticated');
          done();
        },
      });
    });

    it('should fail createTask', (done) => {
      service.createTask('listId', {}).subscribe({
        error: (err) => {
          expect(err.message).toBe('Google Tasks not authenticated');
          done();
        },
      });
    });

    it('should fail updateTask', (done) => {
      service.updateTask('listId', 'taskId', {}).subscribe({
        error: (err) => {
          expect(err.message).toBe('Google Tasks not authenticated');
          done();
        },
      });
    });

    it('should fail deleteTask', (done) => {
      service.deleteTask('listId', 'taskId').subscribe({
        error: (err) => {
          expect(err.message).toBe('Google Tasks not authenticated');
          done();
        },
      });
    });
  });

  describe('Authenticated HTTP calls', () => {
    it('should getTaskLists', () => {
      const mockResponse = { items: [{ id: '1', title: 'List 1' }] };
      service.getTaskLists().subscribe((res) => {
        expect(res).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(`${API_BASE}/users/@me/lists`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe(`Bearer ${mockToken}`);
      req.flush(mockResponse);
    });

    it('should createTaskList', () => {
      const mockResponse: GoogleTaskList = { id: '2', title: 'New List' };
      service.createTaskList('New List').subscribe((res) => {
        expect(res).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(`${API_BASE}/users/@me/lists`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ title: 'New List' });
      req.flush(mockResponse);
    });

    it('should deleteTaskList', () => {
      service.deleteTaskList('list123').subscribe();

      const req = httpMock.expectOne(`${API_BASE}/users/@me/lists/list123`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });

    it('should getTasks without updatedMin', () => {
      const mockResponse = { items: [{ id: 't1', title: 'Task 1' }] };
      service.getTasks('list1', false).subscribe((res) => {
        expect(res).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(
        `${API_BASE}/lists/list1/tasks?showCompleted=false&showHidden=true`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });

    it('should getTasks with updatedMin', () => {
      const mockResponse = { items: [] };
      const timestamp = '2026-01-01T00:00:00.000Z';

      service.getTasks('list1', true, timestamp).subscribe((res) => {
        expect(res).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(
        `${API_BASE}/lists/list1/tasks?showCompleted=true&showHidden=true&updatedMin=${encodeURIComponent(timestamp)}`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });

    it('should createTask', () => {
      const task: GoogleTask = { title: 'Do laundry' };
      const response: GoogleTask = { id: 't1', title: 'Do laundry' };

      service.createTask('list1', task).subscribe((res) => {
        expect(res).toEqual(response);
      });

      const req = httpMock.expectOne(`${API_BASE}/lists/list1/tasks`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(task);
      req.flush(response);
    });

    it('should updateTask (PATCH)', () => {
      const task: GoogleTask = { title: 'Updated Task' };
      const response: GoogleTask = { id: 't1', title: 'Updated Task' };

      service.updateTask('list1', 't1', task).subscribe((res) => {
        expect(res).toEqual(response);
      });

      const req = httpMock.expectOne(`${API_BASE}/lists/list1/tasks/t1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ ...task, id: 't1' });
      req.flush(response);
    });

    it('should deleteTask', () => {
      service.deleteTask('list1', 't1').subscribe();

      const req = httpMock.expectOne(`${API_BASE}/lists/list1/tasks/t1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
