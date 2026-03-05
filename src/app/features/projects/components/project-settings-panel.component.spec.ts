import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, input, output } from '@angular/core';
import { ProjectSettingsPanelComponent } from './project-settings-panel.component';
import { Project } from '../../../core/models/domain.model';

// Mock child components
@Component({ selector: 'app-project-basic-info', standalone: true, template: '' })
class MockProjectBasicInfo {
  project = input<Project>();
  projectChanged = output<void>();
}

@Component({ selector: 'app-section-manager', standalone: true, template: '' })
class MockSectionManager {
  projectId = input<string>();
  sections = input<any[]>();
  sectionsChanged = output<void>();
}

@Component({ selector: 'app-tag-manager', standalone: true, template: '' })
class MockTagManager {
  projectId = input<string>();
  tags = input<any[]>();
  tagsChanged = output<void>();
}

@Component({ selector: 'app-custom-field-manager', standalone: true, template: '' })
class MockCustomFieldManager {
  project = input<Project>();
}

@Component({ selector: 'app-project-member-manager', standalone: true, template: '' })
class MockProjectMemberManager {
  project = input<Project>();
}

@Component({ selector: 'app-project-google-tasks-sync', standalone: true, template: '' })
class MockProjectGoogleTasksSync {
  project = input<Project>();
  projectChanged = output<void>();
}

@Component({ selector: 'app-project-danger-zone', standalone: true, template: '' })
class MockProjectDangerZone {
  project = input<Project>();
  projectChanged = output<void>();
  projectDeleted = output<void>();
}

describe('ProjectSettingsPanelComponent', () => {
  let component: ProjectSettingsPanelComponent;
  let fixture: ComponentFixture<ProjectSettingsPanelComponent>;

  const mockProject: Project = {
    id: 'p1',
    name: 'Test Project',
    description: '',
    color: '#000000',
    icon: 'star',
    ownerId: 'u1',
    status: 'active',
    memberIds: [],
    sections: [],
    tags: [],
    createdAt: null as any,
    updatedAt: null as any,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectSettingsPanelComponent],
    })
      .overrideComponent(ProjectSettingsPanelComponent, {
        set: {
          imports: [
            MockProjectBasicInfo,
            MockSectionManager,
            MockTagManager,
            MockCustomFieldManager,
            MockProjectMemberManager,
            MockProjectGoogleTasksSync,
            MockProjectDangerZone,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ProjectSettingsPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('project', mockProject);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit projectChanged when basic info changes', () => {
    spyOn(component.projectChanged, 'emit');
    const basicInfo = fixture.debugElement.nativeElement.querySelector('app-project-basic-info');
    basicInfo.dispatchEvent(new CustomEvent('projectChanged'));
    expect(component.projectChanged.emit).toHaveBeenCalled();
  });

  it('should emit projectChanged when sections change', () => {
    spyOn(component.projectChanged, 'emit');
    const sectionManager = fixture.debugElement.nativeElement.querySelector('app-section-manager');
    sectionManager.dispatchEvent(new CustomEvent('sectionsChanged'));
    expect(component.projectChanged.emit).toHaveBeenCalled();
  });

  it('should emit projectChanged when tags change', () => {
    spyOn(component.projectChanged, 'emit');
    const tagManager = fixture.debugElement.nativeElement.querySelector('app-tag-manager');
    tagManager.dispatchEvent(new CustomEvent('tagsChanged'));
    expect(component.projectChanged.emit).toHaveBeenCalled();
  });

  it('should emit projectChanged when google tasks sync changes', () => {
    spyOn(component.projectChanged, 'emit');
    const googleTasksSync = fixture.debugElement.nativeElement.querySelector(
      'app-project-google-tasks-sync',
    );
    googleTasksSync.dispatchEvent(new CustomEvent('projectChanged'));
    expect(component.projectChanged.emit).toHaveBeenCalled();
  });

  it('should emit projectChanged when danger zone emits change', () => {
    spyOn(component.projectChanged, 'emit');
    const dangerZone = fixture.debugElement.nativeElement.querySelector('app-project-danger-zone');
    dangerZone.dispatchEvent(new CustomEvent('projectChanged'));
    expect(component.projectChanged.emit).toHaveBeenCalled();
  });

  it('should emit projectDeleted when danger zone emits delete', () => {
    spyOn(component.projectDeleted, 'emit');
    const dangerZone = fixture.debugElement.nativeElement.querySelector('app-project-danger-zone');
    dangerZone.dispatchEvent(new CustomEvent('projectDeleted'));
    expect(component.projectDeleted.emit).toHaveBeenCalled();
  });
});
