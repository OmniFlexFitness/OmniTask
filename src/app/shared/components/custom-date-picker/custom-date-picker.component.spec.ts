import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CustomDatePickerComponent } from './custom-date-picker.component';
import { OverlayModule } from '@angular/cdk/overlay';

describe('CustomDatePickerComponent', () => {
  let component: CustomDatePickerComponent;
  let fixture: ComponentFixture<CustomDatePickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomDatePickerComponent, OverlayModule],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomDatePickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should write value via CVA', () => {
    component.writeValue('2023-05-15');
    expect(component.value()?.getFullYear()).toBe(2023);
    expect(component.value()?.getMonth()).toBe(4); // 0-indexed
    expect(component.value()?.getDate()).toBe(15);
  });

  it('should clear value', () => {
    spyOn(component.valueChange, 'emit');
    component.writeValue('2023-05-15');
    expect(component.value()).toBeTruthy();

    component.clear();
    expect(component.value()).toBeNull();
    expect(component.valueChange.emit).toHaveBeenCalledWith(null);
  });

  it('should select a date', () => {
    spyOn(component.valueChange, 'emit');
    const date = new Date(2023, 4, 15);

    component.selectDate(date);
    expect(component.value()?.getTime()).toBe(date.getTime());
    expect(component.valueChange.emit).toHaveBeenCalledWith('2023-05-15');
    expect(component.isOpen()).toBeFalse();
  });

  it('should toggle open/close', () => {
    expect(component.isOpen()).toBeFalse();
    component.toggleOpen();
    expect(component.isOpen()).toBeTrue();

    component.close();
    expect(component.isOpen()).toBeFalse();
  });

  it('should navigate months', () => {
    const initialMonth = component.viewDate().getMonth();

    component.nextMonth();
    const newMonth = component.viewDate().getMonth();
    expect(newMonth === (initialMonth + 1) % 12).toBeTrue();

    component.prevMonth();
    expect(component.viewDate().getMonth()).toBe(initialMonth);
  });

  it('should select today', () => {
    spyOn(component, 'selectDate');
    component.selectToday();
    expect(component.selectDate).toHaveBeenCalled();
  });
});
