import { TestBed } from '@angular/core/testing';
import { KeyboardShortcutsService } from './keyboard-shortcuts.service';
import { DialogService } from './dialog.service';

describe('KeyboardShortcutsService', () => {
  let service: KeyboardShortcutsService;
  let dialogService: DialogService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(KeyboardShortcutsService);
    dialogService = TestBed.inject(DialogService);
  });

  it('toggles help on ? when not typing', () => {
    const event = new KeyboardEvent('keydown', { key: '?' });
    Object.defineProperty(event, 'target', { value: document.body });
    service.handleGlobalKeydown(event);
    expect(service.helpOpen()).toBeTrue();
    service.handleGlobalKeydown(event);
    expect(service.helpOpen()).toBeFalse();
  });

  it('ignores shortcuts when focus is in an input', () => {
    const input = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: '?' });
    Object.defineProperty(event, 'target', { value: input });
    service.handleGlobalKeydown(event);
    expect(service.helpOpen()).toBeFalse();
  });

  it('dispatches focus-search on Ctrl+K', () => {
    const spy = jasmine.createSpy('focusSearch');
    document.addEventListener('ot:focus-search', spy);
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    Object.defineProperty(event, 'target', { value: document.body });
    service.handleGlobalKeydown(event);
    expect(spy).toHaveBeenCalled();
    document.removeEventListener('ot:focus-search', spy);
  });

  it('closes open dialog on Escape before other handlers', () => {
    void dialogService.confirm('Body', 'Test');
    const cancelSpy = spyOn(dialogService, 'cancelAction').and.callThrough();
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    Object.defineProperty(event, 'target', { value: document.body });
    service.handleGlobalKeydown(event);
    expect(cancelSpy).toHaveBeenCalled();
  });
});
