import { TestBed } from '@angular/core/testing';
import { CustomFieldService } from './custom-field.service';
import * as firestore from '@angular/fire/firestore';
import { Firestore } from '@angular/fire/firestore';
import { AuthService } from '../auth/auth.service';
import { signal } from '@angular/core';
import { of } from 'rxjs';

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

  const safeSpy = (obj: any, method: string) =>
    obj[method]?.and ? obj[method] : spyOn(obj, method);

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

  describe('getCustomFields', () => {
    let collectionDataSpy: jasmine.Spy;
    let querySpy: jasmine.Spy;

    beforeEach(() => {
      collectionDataSpy = safeSpy(firestore, 'collectionData').and.returnValue(
        of([
          { id: 'field-1', name: 'Priority', type: 'status' },
          { id: 'field-2', name: 'Cost', type: 'number' },
        ]),
      );
      querySpy = safeSpy(firestore, 'query').and.returnValue({} as any);
      safeSpy(firestore, 'collection').and.returnValue({} as any);
      safeSpy(firestore, 'orderBy').and.returnValue({} as any);

      collectionDataSpy.calls?.reset();
      querySpy.calls?.reset();
    });

    it('should return empty observable if no user is logged in', (done) => {
      authServiceMock.currentUserSig.set(null as any);
      service.getCustomFields().subscribe((fields) => {
        expect(fields.length).toBe(0);
        authServiceMock.currentUserSig.set({ uid: 'test-user-123', email: 'test@example.com' } as any);
        done();
      });
    });

    it('should get all custom fields for user', (done) => {
      service.getCustomFields().subscribe((fields) => {
        expect(fields.length).toBe(2);
        expect(fields[0].name).toBe('Priority');
        expect(fields[1].name).toBe('Cost');
        expect(collectionDataSpy).toHaveBeenCalled();
        done();
      });
    });
  });

  describe('createCustomField', () => {
    let addDocSpy: jasmine.Spy;

    beforeEach(() => {
      addDocSpy = safeSpy(firestore, 'addDoc').and.returnValue(
        Promise.resolve({ id: 'new-field' } as any),
      );
      addDocSpy.calls?.reset();
      safeSpy(firestore, 'collection').and.returnValue({} as any);
    });

    it('should create a custom field successfully', async () => {
      const res = await service.createCustomField({
        name: 'Test Field',
        type: 'text',
      });
      expect(addDocSpy).toHaveBeenCalled();
      expect(res).toBe('new-field');
      expect(service.loading()).toBe(false);
      expect(service.error()).toBeNull();
    });

    it('should return null if user is not logged in', async () => {
      authServiceMock.currentUserSig.set(null as any);
      const res = await service.createCustomField({
        name: 'Test Field',
        type: 'text',
      });
      expect(res).toBeNull();
      expect(addDocSpy).not.toHaveBeenCalled();
      authServiceMock.currentUserSig.set({ uid: 'test-user-123', email: 'test@example.com' } as any);
    });

    it('should handle errors during creation', async () => {
      addDocSpy.and.returnValue(Promise.reject(new Error('Firebase Error')));
      const res = await service.createCustomField({
        name: 'Test Field',
        type: 'text',
      });
      expect(res).toBeNull();
      expect(service.error()).toBe('Firebase Error');
      expect(service.loading()).toBe(false);
    });
  });

  describe('updateCustomField', () => {
    let updateDocSpy: jasmine.Spy;

    beforeEach(() => {
      updateDocSpy = safeSpy(firestore, 'updateDoc').and.returnValue(Promise.resolve());
      updateDocSpy.calls?.reset();
      safeSpy(firestore, 'doc').and.returnValue({} as any);
    });

    it('should update a custom field successfully', async () => {
      await service.updateCustomField('field-1', { name: 'Updated Field' });
      expect(updateDocSpy).toHaveBeenCalled();
      expect(service.loading()).toBe(false);
      expect(service.error()).toBeNull();
    });

    it('should return if user is not logged in', async () => {
      authServiceMock.currentUserSig.set(null as any);
      await service.updateCustomField('field-1', { name: 'Updated Field' });
      expect(updateDocSpy).not.toHaveBeenCalled();
      authServiceMock.currentUserSig.set({ uid: 'test-user-123', email: 'test@example.com' } as any);
    });

    it('should handle errors during update', async () => {
      updateDocSpy.and.returnValue(Promise.reject(new Error('Update Error')));
      await service.updateCustomField('field-1', { name: 'Updated Field' });
      expect(service.error()).toBe('Update Error');
      expect(service.loading()).toBe(false);
    });
  });

  describe('deleteCustomField', () => {
    let deleteDocSpy: jasmine.Spy;

    beforeEach(() => {
      deleteDocSpy = safeSpy(firestore, 'deleteDoc').and.returnValue(Promise.resolve());
      deleteDocSpy.calls?.reset();
      safeSpy(firestore, 'doc').and.returnValue({} as any);
    });

    it('should delete a custom field successfully', async () => {
      await service.deleteCustomField('field-1');
      expect(deleteDocSpy).toHaveBeenCalled();
      expect(service.loading()).toBe(false);
      expect(service.error()).toBeNull();
    });

    it('should return if user is not logged in', async () => {
      authServiceMock.currentUserSig.set(null as any);
      await service.deleteCustomField('field-1');
      expect(deleteDocSpy).not.toHaveBeenCalled();
      authServiceMock.currentUserSig.set({ uid: 'test-user-123', email: 'test@example.com' } as any);
    });

    it('should handle errors during deletion', async () => {
      deleteDocSpy.and.returnValue(Promise.reject(new Error('Delete Error')));
      await service.deleteCustomField('field-1');
      expect(service.error()).toBe('Delete Error');
      expect(service.loading()).toBe(false);
    });
  });
});
