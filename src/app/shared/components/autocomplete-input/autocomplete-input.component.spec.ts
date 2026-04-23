import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { AutocompleteInputComponent } from './autocomplete-input.component';
import { OverlayModule } from '@angular/cdk/overlay';
import { FormsModule } from '@angular/forms';
import { ComponentRef } from '@angular/core';

describe('AutocompleteInputComponent', () => {
  let component: AutocompleteInputComponent;
  let fixture: ComponentFixture<AutocompleteInputComponent>;
  let componentRef: ComponentRef<AutocompleteInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AutocompleteInputComponent, OverlayModule, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AutocompleteInputComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;

    componentRef.setInput('options', [
      { id: '1', label: 'Apple' },
      { id: '2', label: 'Banana' },
      { id: '3', label: 'Cherry' },
    ]);
    componentRef.setInput('placeholder', 'Search fruits...');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should sync display value correctly on initialization', () => {
    componentRef.setInput('value', '2');
    fixture.detectChanges();
    expect(component.selectedOption()?.label).toBe('Banana');
    expect(component.inputValue()).toBe('Banana');
    expect(component.displayValue()).toBe('Banana');
  });

  it('should filter options based on input', () => {
    component.inputValue.set('a');
    expect(component.filteredOptions().length).toBe(2); // Apple, Banana

    component.inputValue.set('ban');
    expect(component.filteredOptions().length).toBe(1);
    expect(component.filteredOptions()[0].label).toBe('Banana');

    // Case insensitive
    component.inputValue.set('CHERRY');
    expect(component.filteredOptions().length).toBe(1);
  });

  it('should open dropdown on input focus', () => {
    component.onFocus();
    expect(component.isOpen()).toBeTrue();
  });

  it('should handle input correctly', fakeAsync(() => {
    spyOn(component.search, 'emit');
    spyOn(component.valueChange, 'emit');

    component.onInput({ target: { value: 'Mango' } } as any);

    expect(component.isOpen()).toBeTrue();
    expect(component.inputValue()).toBe('Mango');

    // Test debounce
    tick(300);
    expect(component.search.emit).toHaveBeenCalledWith('Mango');
    // valueChange should not be emitted unless allowCustom is true
  }));

  it('should select an option', () => {
    spyOn(component.optionSelected, 'emit');
    spyOn(component.valueChange, 'emit');

    const option = { id: '3', label: 'Cherry' };
    component.selectOption(option);

    expect(component.selectedOption()).toBe(option);
    expect(component.inputValue()).toBe('Cherry');
    expect(component.isOpen()).toBeFalse();
    expect(component.optionSelected.emit).toHaveBeenCalledWith(option);
    expect(component.valueChange.emit).toHaveBeenCalledWith('Cherry'); // label is emitted
  });

  it('should handle custom value when allowCustom is true', () => {
    componentRef.setInput('allowCustom', true);
    spyOn(component.optionSelected, 'emit');
    spyOn(component.valueChange, 'emit');

    component.inputValue.set('Durian');
    component.isOpen.set(true);

    // Simulate enter on no exact match
    component.onKeydown({ key: 'Enter', preventDefault: () => {} } as any);

    expect(component.selectedOption()).toBeNull();
    expect(component.isOpen()).toBeFalse();
    expect(component.optionSelected.emit).toHaveBeenCalledWith('Durian');
    expect(component.valueChange.emit).toHaveBeenCalledWith('Durian');
  });

  it('should clear selection via clearSelection()', () => {
    spyOn(component.optionSelected, 'emit');
    spyOn(component.valueChange, 'emit');

    component.selectOption({ id: '1', label: 'Apple' });
    expect(component.selectedOption()).toBeTruthy();

    component.clear();

    expect(component.selectedOption()).toBeNull();
    expect(component.inputValue()).toBe('');
    expect(component.isOpen()).toBeTrue();
    expect(component.optionSelected.emit).toHaveBeenCalledWith('');
    expect(component.valueChange.emit).toHaveBeenCalledWith('');
  });

  it('should handle keyboard navigation', () => {
    component.isOpen.set(true);
    component.inputValue.set('a'); // Filters to Apple(0), Banana(1)

    // Arrow Down
    component.onKeydown({ key: 'ArrowDown', preventDefault: () => {} } as any);
    expect(component.activeIndex()).toBe(0);

    // Arrow Down again
    component.onKeydown({ key: 'ArrowDown', preventDefault: () => {} } as any);
    expect(component.activeIndex()).toBe(1);

    // Arrow Up
    component.onKeydown({ key: 'ArrowUp', preventDefault: () => {} } as any);
    expect(component.activeIndex()).toBe(0);
  });
});
