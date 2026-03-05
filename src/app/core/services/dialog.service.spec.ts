import { TestBed } from '@angular/core/testing';
import { DialogService } from './dialog.service';

describe('DialogService', () => {
  let service: DialogService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DialogService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
    expect(service.dialog().isOpen).toBe(false);
  });

  it('should show alert and close properly', async () => {
    const alertPromise = service.alert('Test alert', 'Title');

    expect(service.dialog().isOpen).toBe(true);
    expect(service.dialog().message).toBe('Test alert');
    expect(service.dialog().title).toBe('Title');
    expect(service.dialog().type).toBe('info');

    // act
    service.confirmAction();

    await alertPromise;
    expect(service.dialog().isOpen).toBe(false);
  });

  it('should show confirm and resolve true when confirmed', async () => {
    const confirmPromise = service.confirm('Are you sure?');

    expect(service.dialog().isOpen).toBe(true);
    expect(service.dialog().type).toBe('confirm');

    service.confirmAction();

    const result = await confirmPromise;
    expect(result).toBe(true);
    expect(service.dialog().isOpen).toBe(false);
  });

  it('should show custom dialog and resolve false when cancelled', async () => {
    const customPromise = service.show({
      message: 'Custom message',
      type: 'error',
    });

    expect(service.dialog().isOpen).toBe(true);
    expect(service.dialog().type).toBe('error');

    service.cancelAction();

    const result = await customPromise;
    expect(result).toBe(false);
    expect(service.dialog().isOpen).toBe(false);
  });
});
