import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProjectsListComponent } from './projects-list.component';
import { ProjectService } from '../../core/services/project.service';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('ProjectsListComponent', () => {
  let component: ProjectsListComponent;
  let fixture: ComponentFixture<ProjectsListComponent>;
  let mockProjectService: any;
  let mockRouter: any;

  beforeEach(async () => {
    mockProjectService = jasmine.createSpyObj('ProjectService', ['getMyProjects', 'deleteProject']);
    mockProjectService.getMyProjects.and.returnValue(
      of([
        {
          id: 'p1',
          name: 'Project Alpha',
          description: 'desc 1',
          color: '#ff0000',
          icon: 'home',
          ownerId: 'u1',
          memberIds: [],
          settings: {},
          sections: [],
        },
        {
          id: 'p2',
          name: 'Project Beta',
          description: 'desc 2',
          color: '#00ff00',
          icon: 'work',
          ownerId: 'u1',
          memberIds: [],
          settings: {},
          sections: [],
        },
      ]),
    );
    mockProjectService.deleteProject.and.returnValue(Promise.resolve());

    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [ProjectsListComponent],
      providers: [
        { provide: ProjectService, useValue: mockProjectService },
        { provide: Router, useValue: mockRouter },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component.projects().length).toBe(2);
  });

  it('should compute filteredProjects correctly based on searchQuery', () => {
    expect(component.filteredProjects().length).toBe(2);

    component.searchQuery.set('alpha');
    expect(component.filteredProjects().length).toBe(1);
    expect(component.filteredProjects()[0].id).toBe('p1');

    component.searchQuery.set('beta');
    expect(component.filteredProjects().length).toBe(1);
    expect(component.filteredProjects()[0].id).toBe('p2');

    component.searchQuery.set('xyz');
    expect(component.filteredProjects().length).toBe(0);
  });

  it('should navigate on openProject', () => {
    const project = component.projects()[0];
    component.openProject(project);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/projects', 'p1']);
  });

  it('should set editingProject on editProject', () => {
    const project = component.projects()[0];
    const event = new Event('click');
    spyOn(event, 'stopPropagation');

    component.editProject(project, event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(component.editingProject()?.id).toBe('p1');
  });

  it('should set projectToDelete on confirmDelete', () => {
    const project = component.projects()[0];
    const event = new Event('click');
    spyOn(event, 'stopPropagation');

    component.confirmDelete(project, event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(component.projectToDelete()?.id).toBe('p1');
  });

  it('should call projectService.deleteProject on deleteProject', async () => {
    const project = component.projects()[0];
    const event = new Event('click');
    component.confirmDelete(project, event);

    await component.deleteProject();

    expect(component.deleting()).toBeFalse();
    expect(mockProjectService.deleteProject).toHaveBeenCalledWith('p1');
    expect(component.projectToDelete()).toBeNull();
  });

  it('should not delete if no project is configured for deletion', async () => {
    await component.deleteProject();
    expect(mockProjectService.deleteProject).not.toHaveBeenCalled();
  });

  it('should clear modals on closeModal', () => {
    component.showCreateModal.set(true);
    component.editingProject.set(component.projects()[0]);

    component.closeModal();

    expect(component.showCreateModal()).toBeFalse();
    expect(component.editingProject()).toBeNull();
  });

  it('should call closeModal onProjectSaved', () => {
    spyOn(component, 'closeModal');
    component.onProjectSaved(component.projects()[0]);
    expect(component.closeModal).toHaveBeenCalled();
  });
});
