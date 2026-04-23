import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CustomSelectComponent } from './custom-select.component';

describe('CustomSelectComponent', () => {
  let component: CustomSelectComponent;
  let fixture: ComponentFixture<CustomSelectComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomSelectComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomSelectComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('options', [
      { value: 'opt1', label: 'Option 1' },
      { value: 'opt2', label: 'Option 2' },
    ]);
    fixture.componentRef.setInput('placeholder', 'Select an option');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle open/close', () => {
    expect(component.isOpen()).toBeFalse();
    component.toggleOpen();
    expect(component.isOpen()).toBeTrue();

    component.close();
    expect(component.isOpen()).toBeFalse();
  });

  it('should handle document click outside', () => {
    component.toggleOpen();
    expect(component.isOpen()).toBeTrue();

    const event = new MouseEvent('click');
    spyOn(component['elementRef'].nativeElement, 'contains').and.returnValue(false);

    component.clickout(event);
    expect(component.isOpen()).toBeFalse();
  });

  it('should select an option and call registered onChange callbacks', () => {
    spyOn(component.valueChange, 'emit');
    let writtenValue = '';
    component.registerOnChange((val: string) => (writtenValue = val));

    const option = { value: 'opt2', label: 'Option 2' };
    component.selectOption(option);

    expect(component.value()).toBe('opt2');
    expect(component.isOpen()).toBeFalse();
    expect(component.valueChange.emit).toHaveBeenCalledWith('opt2');
    expect(writtenValue).toBe('opt2');
  });

  it('should write value correctly via ControlValueAccessor', () => {
    component.writeValue('opt1');
    expect(component.value()).toBe('opt1');
    expect(component.selectedOption()?.value).toBe('opt1');

    component.writeValue(null);
    expect(component.value()).toBeNull();
    expect(component.selectedOption()).toBeNull();
  });

  it('should handle disabled state', () => {
    component.setDisabledState!(true);
    expect(component.disabled()).toBeTrue();

    component.setDisabledState!(false);
    expect(component.disabled()).toBeFalse();
  });
});
