import { TestBed } from '@angular/core/testing';
import { ProjectService } from './project.service';
import * as firestore from '@angular/fire/firestore';
import { Firestore } from '@angular/fire/firestore';
import { AuthService } from '../auth/auth.service';
import { GoogleTasksSyncService } from './google-tasks-sync.service';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { Project, DEFAULT_SECTIONS } from '../models/domain.model';

describe('ProjectService', () => {
  let service: ProjectService;

  const firestoreMock = {} as unknown as Firestore;
  Object.setPrototypeOf(firestoreMock, Firestore.prototype);

  const authServiceMock = {
    currentUserSig: signal({ uid: 'user-1' }),
    user$: of({ uid: 'user-1' }),
  };

  const googleTasksSyncServiceMock = {
    createTaskListForProject: jasmine
      .createSpy('createTaskListForProject')
      .and.returnValue(Promise.resolve('list-1')),
    deleteTaskListForProject: jasmine
      .createSpy('deleteTaskListForProject')
      .and.returnValue(Promise.resolve()),
  };

  const safeSpy = (obj: any, method: string) =>
    obj[method]?.and ? obj[method] : spyOn(obj, method);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProjectService,
        { provide: Firestore, useValue: firestoreMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: GoogleTasksSyncService, useValue: googleTasksSyncServiceMock },
      ],
    });

    service = TestBed.inject(ProjectService);
    googleTasksSyncServiceMock.createTaskListForProject.calls.reset();
    googleTasksSyncServiceMock.deleteTaskListForProject.calls.reset();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('query methods', () => {
    let collectionDataSpy: jasmine.Spy;
    let querySpy: jasmine.Spy;

    beforeEach(() => {
      collectionDataSpy = safeSpy(firestore, 'collectionData').and.returnValue(
        of([
          { id: '1', name: 'Z Project', tags: [{ id: 't1', name: 'Bug' }] },
          {
            id: '2',
            name: 'A Project',
            tags: [
              { id: 't1', name: 'Bug' },
              { id: 't2', name: 'Feature' },
            ],
          },
        ]),
      );
      querySpy = safeSpy(firestore, 'query').and.returnValue({} as any);
      safeSpy(firestore, 'collection').and.returnValue({} as any);
      safeSpy(firestore, 'where').and.returnValue({} as any);

      collectionDataSpy.calls?.reset();
      querySpy.calls?.reset();
    });

    it('should get my projects sorted by name', (done) => {
      service.getMyProjects().subscribe((projects) => {
        expect(projects.length).toBe(2);
        expect(projects[0].name).toBe('A Project');
        expect(projects[1].name).toBe('Z Project');
        done();
      });
    });

    it('should get all tags deduped and sorted', (done) => {
      service.getAllTags().subscribe((tags) => {
        expect(tags.length).toBe(2);
        expect(tags[0].name).toBe('Bug');
        expect(tags[1].name).toBe('Feature');
        done();
      });
    });
  });

  describe('CRUD operations', () => {
    let addDocSpy: jasmine.Spy;
    let updateDocSpy: jasmine.Spy;
    let deleteDocSpy: jasmine.Spy;
    let getDocSpy: jasmine.Spy;
    let docSpy: jasmine.Spy;

    beforeEach(() => {
      addDocSpy = safeSpy(firestore, 'addDoc').and.returnValue(
        Promise.resolve({ id: 'new-proj' } as any),
      );
      updateDocSpy = safeSpy(firestore, 'updateDoc').and.returnValue(Promise.resolve());
      deleteDocSpy = safeSpy(firestore, 'deleteDoc').and.returnValue(Promise.resolve());
      getDocSpy = safeSpy(firestore, 'getDoc').and.returnValue(
        Promise.resolve({
          exists: () => true,
          id: 'proj-1',
          data: () => ({ name: 'Test', ownerId: 'user-1', memberIds: ['user-1'] }),
        } as any),
      );
      docSpy = safeSpy(firestore, 'doc').and.returnValue({} as any);
      safeSpy(firestore, 'collection').and.returnValue({} as any);

      addDocSpy.calls?.reset();
      updateDocSpy.calls?.reset();
      deleteDocSpy.calls?.reset();
      getDocSpy.calls?.reset();
      docSpy.calls?.reset();
    });

    it('should get a project by ID', async () => {
      const res = await service.getProject('proj-1');
      expect(getDocSpy).toHaveBeenCalled();
      expect(res?.id).toBe('proj-1');
      expect(res?.name).toBe('Test');
    });

    it('should return null if project does not exist', async () => {
      getDocSpy.and.returnValue(Promise.resolve({ exists: () => false } as any));
      const res = await service.getProject('proj-2');
      expect(res).toBeNull();
    });

    it('should create a project and sync to google tasks', async () => {
      const res = await service.createProject('New Proj', 'Desc', '#fff');
      expect(addDocSpy).toHaveBeenCalled();
      expect(googleTasksSyncServiceMock.createTaskListForProject).toHaveBeenCalledWith(
        'new-proj',
        'New Proj',
      );
      expect(res.id).toBe('new-proj');
    });

    it('should throw if user is not authenticated when creating project', async () => {
      authServiceMock.currentUserSig.set(null as any);
      await expectAsync(service.createProject('Test')).toBeRejectedWithError('Not authenticated');
      authServiceMock.currentUserSig.set({ uid: 'user-1' } as any);
    });

    it('should update a project', async () => {
      await service.updateProject('proj-1', { name: 'Updated' });
      expect(updateDocSpy).toHaveBeenCalled();
    });

    it('should archive a project', async () => {
      spyOn(service, 'updateProject').and.returnValue(Promise.resolve());
      await service.archiveProject('proj-1');
      expect(service.updateProject).toHaveBeenCalledWith('proj-1', { status: 'archived' });
    });

    it('should restore a project', async () => {
      spyOn(service, 'updateProject').and.returnValue(Promise.resolve());
      await service.restoreProject('proj-1');
      expect(service.updateProject).toHaveBeenCalledWith('proj-1', { status: 'active' });
    });

    it('should delete a project and its google task list', async () => {
      spyOn(service, 'getProject').and.returnValue(
        Promise.resolve({ id: 'proj-1', googleTaskListId: 'list-1' } as any),
      );
      await service.deleteProject('proj-1');
      expect(googleTasksSyncServiceMock.deleteTaskListForProject).toHaveBeenCalledWith('list-1');
      expect(deleteDocSpy).toHaveBeenCalled();
    });

    it('should throw when deleting non-existent project', async () => {
      spyOn(service, 'getProject').and.returnValue(Promise.resolve(null));
      await expectAsync(service.deleteProject('proj-1')).toBeRejectedWithError('Project not found');
    });
  });

  describe('nested entity management', () => {
    let mockProject: any;

    beforeEach(() => {
      mockProject = {
        id: 'proj-1',
        ownerId: 'owner-1',
        memberIds: ['owner-1', 'member-1'],
        sections: [{ id: 's1', name: 'To Do', order: 0 }],
        tags: [{ id: 't1', name: 'Bug' }],
        customFields: [{ id: 'f1', name: 'Priority' }],
      };
      spyOn(service, 'getProject').and.returnValue(Promise.resolve(mockProject));
      spyOn(service, 'updateProject').and.returnValue(Promise.resolve());
    });

    // Sections
    it('should add a section', async () => {
      const res = await service.addSection('proj-1', 'Done');
      expect(res.name).toBe('Done');
      expect(service.updateProject).toHaveBeenCalled();
    });

    it('should update a section', async () => {
      await service.updateSection('proj-1', 's1', { name: 'Doing' });
      expect(service.updateProject).toHaveBeenCalled();
      const callArgs = (service.updateProject as jasmine.Spy).calls.mostRecent().args;
      expect(callArgs[1].sections[0].name).toBe('Doing');
    });

    it('should remove a section', async () => {
      await service.removeSection('proj-1', 's1');
      expect(service.updateProject).toHaveBeenCalled();
      const callArgs = (service.updateProject as jasmine.Spy).calls.mostRecent().args;
      expect(callArgs[1].sections.length).toBe(0);
    });

    it('should reorder sections', async () => {
      const newSections = [{ id: 's2', name: 'Done', order: 0 } as any];
      await service.reorderSections('proj-1', newSections);
      expect(service.updateProject).toHaveBeenCalledWith('proj-1', { sections: newSections });
    });

    // Members
    it('should add a member', async () => {
      await service.addMember('proj-1', 'new-member');
      expect(service.updateProject).toHaveBeenCalled();
      const callArgs = (service.updateProject as jasmine.Spy).calls.mostRecent().args;
      expect(callArgs[1].memberIds).toContain('new-member');
    });

    it('should not add existing member', async () => {
      await service.addMember('proj-1', 'member-1');
      expect(service.updateProject).not.toHaveBeenCalled();
    });

    it('should remove a member', async () => {
      await service.removeMember('proj-1', 'member-1');
      expect(service.updateProject).toHaveBeenCalled();
      const callArgs = (service.updateProject as jasmine.Spy).calls.mostRecent().args;
      expect(callArgs[1].memberIds).not.toContain('member-1');
    });

    it('should prevent removing the owner', async () => {
      await expectAsync(service.removeMember('proj-1', 'owner-1')).toBeRejectedWithError(
        'Cannot remove project owner',
      );
    });

    // Custom Fields
    it('should link a custom field', async () => {
      // Create a mock project
      (service.getProject as jasmine.Spy).and.returnValue(
        Promise.resolve({
          id: 'proj-1',
          customFieldIds: ['f0'],
        }),
      );
      await service.linkCustomField('proj-1', 'f1');
      expect(service.updateProject).toHaveBeenCalled();
      const callArgs = (service.updateProject as jasmine.Spy).calls.mostRecent().args;
      expect(callArgs[1].customFieldIds).toContain('f1');
    });

    it('should not link a custom field if already linked', async () => {
      // Create a mock project
      (service.getProject as jasmine.Spy).and.returnValue(
        Promise.resolve({
          id: 'proj-1',
          customFieldIds: ['f1'],
        }),
      );
      await service.linkCustomField('proj-1', 'f1');
      expect(service.updateProject).not.toHaveBeenCalled();
    });

    it('should unlink a custom field', async () => {
      // Create a mock project
      (service.getProject as jasmine.Spy).and.returnValue(
        Promise.resolve({
          id: 'proj-1',
          customFieldIds: ['f1', 'f2'],
        }),
      );
      await service.unlinkCustomField('proj-1', 'f1');
      expect(service.updateProject).toHaveBeenCalled();
      const callArgs = (service.updateProject as jasmine.Spy).calls.mostRecent().args;
      expect(callArgs[1].customFieldIds).not.toContain('f1');
      expect(callArgs[1].customFieldIds).toContain('f2');
    });

    // Tags
    it('should add a tag', async () => {
      const res = await service.addTag('proj-1', { name: 'Feature', color: 'blue' });
      expect(res.name).toBe('Feature');
      expect(service.updateProject).toHaveBeenCalled();
    });

    it('should not add an empty tag', async () => {
      await expectAsync(
        service.addTag('proj-1', { name: '   ', color: 'blue' }),
      ).toBeRejectedWithError('Tag name cannot be empty');
    });

    it('should return existing tag if adding duplicate name', async () => {
      const res = await service.addTag('proj-1', { name: 'bug', color: 'red' });
      expect(res.id).toBe('t1');
      expect(service.updateProject).not.toHaveBeenCalled();
    });

    it('should remove a tag', async () => {
      await service.removeTag('proj-1', 't1');
      expect(service.updateProject).toHaveBeenCalled();
    });
  });
});
