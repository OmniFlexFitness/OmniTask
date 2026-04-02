import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CustomFieldManagerComponent } from './custom-field-manager.component';
import { ProjectService } from '../../../../core/services/project.service';
import { CustomFieldService } from '../../../../core/services/custom-field.service';
import { DialogService } from '../../../../core/services/dialog.service';
import { signal, ComponentRef } from '@angular/core';
import { of } from 'rxjs';
import { Project, CustomFieldDefinition } from '../../../../core/models/domain.model';

describe('CustomFieldManagerComponent', () => {
  let component: CustomFieldManagerComponent;
  let fixture: ComponentFixture<CustomFieldManagerComponent>;
  let componentRef: ComponentRef<CustomFieldManagerComponent>;

  const mockProject: Project = {
    id: 'proj-1',
    name: 'Test Project',
    ownerId: 'user-1',
    memberIds: ['user-1'],
    sections: [],
    customFieldIds: ['field-1'],
    status: 'active',
    createdAt: null as any,
  };

  const mockGlobalFields: CustomFieldDefinition[] = [
    {
      id: 'field-1',
      userId: 'user-1',
      name: 'Priority',
      type: 'status',
      options: [{ id: 'opt-1', label: 'High' }],
      createdAt: null as any,
      updatedAt: null as any,
    },
    {
      id: 'field-2',
      userId: 'user-1',
      name: 'Cost',
      type: 'number',
      createdAt: null as any,
      updatedAt: null as any,
    },
  ];

  const projectServiceMock = {
    linkCustomField: jasmine.createSpy('linkCustomField').and.returnValue(Promise.resolve()),
    unlinkCustomField: jasmine.createSpy('unlinkCustomField').and.returnValue(Promise.resolve()),
  };

  const customFieldServiceMock = {
    getCustomFields: jasmine.createSpy('getCustomFields').and.returnValue(of(mockGlobalFields)),
    createCustomField: jasmine.createSpy('createCustomField').and.returnValue(Promise.resolve('new-field-id')),
  };

  const dialogServiceMock = {
    alert: jasmine.createSpy('alert').and.returnValue(Promise.resolve()),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomFieldManagerComponent],
      providers: [
        { provide: ProjectService, useValue: projectServiceMock },
        { provide: CustomFieldService, useValue: customFieldServiceMock },
        { provide: DialogService, useValue: dialogServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomFieldManagerComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
    
    // Set required input
    componentRef.setInput('project', mockProject);

    // customFieldServiceMock.getCustomFields.calls.reset(); // Do not reset since it's called in constructor
    customFieldServiceMock.createCustomField.calls.reset();
    projectServiceMock.linkCustomField.calls.reset();
    projectServiceMock.unlinkCustomField.calls.reset();
    dialogServiceMock.alert.calls.reset();

    // Trigger initial data binding
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(customFieldServiceMock.getCustomFields).toHaveBeenCalled();
  });

  describe('computed signals', () => {
    it('should compute projectFields correctly', () => {
      const projectFields = component.projectFields();
      expect(projectFields.length).toBe(1);
      expect(projectFields[0].id).toBe('field-1');
      expect(projectFields[0].name).toBe('Priority');
    });

    it('should compute availableFieldsToLink correctly', () => {
      const availableFields = component.availableFieldsToLink();
      expect(availableFields.length).toBe(1);
      expect(availableFields[0].id).toBe('field-2');
      expect(availableFields[0].name).toBe('Cost');
    });

    it('should correctly identify duplicate field names in global definitions', () => {
      // Not a duplicate
      component.newFieldName.set('New Custom Field');
      expect(component.isDuplicateFieldName()).toBe(false);

      // Duplicate (case-insensitive)
      component.newFieldName.set('priority');
      expect(component.isDuplicateFieldName()).toBe(true);
    });

    it('should evaluate canCreateField correctly', () => {
      component.newFieldName.set('New Valid Field');
      component.newFieldType.set('text');
      expect(component.canCreateField()).toBe(true); // Should be true

      component.newFieldName.set(''); // Invalid name
      expect(component.canCreateField()).toBe(false);

      component.newFieldName.set('priority'); // Duplicate name
      expect(component.canCreateField()).toBe(false);

      component.newFieldName.set('Status Field');
      component.newFieldType.set('status');
      component.newFieldOptions.set([]); // Must have options
      expect(component.canCreateField()).toBe(false);

      component.newFieldOptions.set([{ id: 'opt-x', label: 'Done' }]);
      expect(component.canCreateField()).toBe(true);
    });
  });

  describe('creation UI logic', () => {
    it('startCreating should reset state and switch mode to create', () => {
      component.mode.set('list');
      component.newFieldName.set('Some text');
      component.newFieldOptions.set([{ id: 'test', label: 'test' }]);
      
      component.startCreating();
      
      expect(component.mode()).toBe('create');
      expect(component.newFieldName()).toBe('');
      expect(component.newFieldOptions().length).toBe(0);
      expect(component.newFieldType()).toBe('text');
      expect(component.newFieldCurrency()).toBe('$');
    });

    it('addOption should create a new CustomFieldOption', () => {
      component.addOption('High Priority');
      const opts = component.newFieldOptions();
      expect(opts.length).toBe(1);
      expect(opts[0].label).toBe('High Priority');
      expect(opts[0].color).toBe('#64748b');
      expect(opts[0].id).toBeDefined();
    });

    it('removeOption should remove correct option via id', () => {
      component.addOption('High');
      component.addOption('Low');
      const lowOptionId = component.newFieldOptions().find(o => o.label === 'Low')!.id;
      
      component.removeOption(lowOptionId);
      
      const updatedOpts = component.newFieldOptions();
      expect(updatedOpts.length).toBe(1);
      expect(updatedOpts[0].label).toBe('High');
    });
  });

  describe('field actions', () => {
    it('should create field global, link to project and reset if successful', async () => {
      component.newFieldName.set('Test Number Field');
      component.newFieldType.set('number');
      component.mode.set('create');

      await component.createField();

      expect(customFieldServiceMock.createCustomField).toHaveBeenCalledWith(jasmine.objectContaining({
        name: 'Test Number Field',
        type: 'number'
      }));
      expect(projectServiceMock.linkCustomField).toHaveBeenCalledWith('proj-1', 'new-field-id');
      expect(component.mode()).toBe('list');
      expect(component.newFieldName()).toBe('');
    });

    it('should not create field if canCreateField is false', async () => {
      component.newFieldName.set(''); // Invalid state
      await component.createField();
      expect(customFieldServiceMock.createCustomField).not.toHaveBeenCalled();
    });

    it('should handle errors during create and show alert dialog', async () => {
      component.mode.set('create');
      component.newFieldName.set('Failing Field');
      component.newFieldType.set('text');
      customFieldServiceMock.createCustomField.and.returnValue(Promise.reject(new Error('Firebase Error')));

      await component.createField();

      expect(dialogServiceMock.alert).toHaveBeenCalled();
      expect(component.mode()).toBe('create'); // Should stay in create mode
    });

    it('should link existing field', async () => {
      await component.linkExistingField('field-2');
      expect(projectServiceMock.linkCustomField).toHaveBeenCalledWith('proj-1', 'field-2');
      expect(component.mode()).toBe('list');
    });

    it('should unlink field', async () => {
      component.fieldToDelete.set(mockGlobalFields[0]); // field-1
      
      await component.unlinkField();
      
      expect(projectServiceMock.unlinkCustomField).toHaveBeenCalledWith('proj-1', 'field-1');
      expect(component.fieldToDelete()).toBeNull();
      expect(component.deleting()).toBe(false);
    });
  });
});
