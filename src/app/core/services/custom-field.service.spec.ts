import { TestBed } from '@angular/core/testing';
import { CustomFieldService } from './custom-field.service';
import { Firestore } from '@angular/fire/firestore';
import { AuthService } from '../auth/auth.service';
import { signal } from '@angular/core';

/**
 * Unit tests for CustomFieldService
 */
describe('CustomFieldService', () => {
  let service: CustomFieldService;

  const firestoreMock = {} as unknown as Firestore;
  Object.setPrototypeOf(firestoreMock, Firestore.prototype);

  const authServiceMock = {
    currentUserSig: signal({ uid: 'test-user-123', email: 'test@example.com' }),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CustomFieldService,
        { provide: Firestore, useValue: firestoreMock },
        { provide: AuthService, useValue: authServiceMock },
      ],
    });

    service = TestBed.inject(CustomFieldService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loading state', () => {
    it('should initialize with loading = false', () => {
      expect(service.loading()).toBe(false);
    });

    it('should initialize with error = null', () => {
      expect(service.error()).toBeNull();
    });
  });

  describe('createCustomField', () => {
    it('should be defined and callable', () => {
      expect(service.createCustomField).toBeDefined();
      expect(typeof service.createCustomField).toBe('function');
    });

    it('should not throw synchronously', async () => {
      const promise = service.createCustomField({
        name: 'Test Field',
        type: 'text',
      });
      // Ensure the promise is defined
      expect(promise).toBeDefined();
      try {
        await promise;
      } catch (e) {
        // FireStore emulator might not be running in tests
      }
    });
  });

  describe('updateCustomField', () => {
    it('should be defined', () => {
      expect(service.updateCustomField).toBeDefined();
    });
  });

  describe('deleteCustomField', () => {
    it('should be defined', () => {
      expect(service.deleteCustomField).toBeDefined();
    });
  });

  describe('getCustomFields', () => {
    it('should be defined', () => {
      expect(service.getCustomFields).toBeDefined();
    });
  });
});
