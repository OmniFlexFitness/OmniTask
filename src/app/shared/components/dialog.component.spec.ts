import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogComponent } from './dialog.component';
import { DialogService } from '../../core/services/dialog.service';

import { signal } from '@angular/core';

describe('DialogComponent', () => {
  let component: DialogComponent;
  let fixture: ComponentFixture<DialogComponent>;
  let mockDialogService: any;

  beforeEach(async () => {
    mockDialogService = {
      dialog: signal({ isOpen: false }),
      confirmAction: jasmine.createSpy('confirmAction'),
      cancelAction: jasmine.createSpy('cancelAction'),
    };

    await TestBed.configureTestingModule({
      imports: [DialogComponent],
      providers: [{ provide: DialogService, useValue: mockDialogService }],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call confirmAction on confirm', () => {
    component.onConfirm();
    expect(mockDialogService.confirmAction).toHaveBeenCalled();
  });

  it('should call cancelAction on cancel', () => {
    component.onCancel();
    expect(mockDialogService.cancelAction).toHaveBeenCalled();
  });
});
