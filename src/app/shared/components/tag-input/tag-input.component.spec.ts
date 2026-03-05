import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TagInputComponent } from './tag-input.component';
import { OverlayModule } from '@angular/cdk/overlay';
import { FormsModule } from '@angular/forms';
import { ComponentRef } from '@angular/core';

describe('TagInputComponent', () => {
  let component: TagInputComponent;
  let fixture: ComponentFixture<TagInputComponent>;
  let componentRef: ComponentRef<TagInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TagInputComponent, OverlayModule, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(TagInputComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;

    // Set standard inputs
    componentRef.setInput('availableTags', [
      { id: '1', name: 'Bug', color: '#ff0000', usedIn: [] },
      { id: '2', name: 'Feature', color: '#00ff00', usedIn: [] },
    ]);
    componentRef.setInput('selectedTags', []);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should filter tags correctly based on inputValue and selected tags', () => {
    component.inputValue = 'bug';
    expect(component.filteredTags().length).toBe(1);
    expect(component.filteredTags()[0].name).toBe('Bug');

    // Add 'Bug' to selected tags, it should no longer be in filtered
    componentRef.setInput('selectedTags', [{ id: '1', name: 'Bug', color: '#ff0000', usedIn: [] }]);
    component.inputValue = '';
    expect(component.filteredTags().length).toBe(1);
    expect(component.filteredTags()[0].name).toBe('Feature');
  });

  it('should open on focus', () => {
    component.onFocus();
    expect(component.isOpen()).toBeTrue();
  });

  it('should open and reset active index onInput', () => {
    component.activeIndex.set(3);
    component.onInput();
    expect(component.isOpen()).toBeTrue();
    expect(component.activeIndex()).toBe(0);
  });

  it('should close correctly', () => {
    component.isOpen.set(true);
    component.activeIndex.set(2);
    component.close();
    expect(component.isOpen()).toBeFalse();
    expect(component.activeIndex()).toBe(-1);
  });

  it('should select a tag that is not already selected', () => {
    spyOn(component.tagsChange, 'emit');
    const tag = { id: '2', name: 'Feature', color: '#00ff00', usedIn: [] };

    component.selectTag(tag);

    expect(component.tagsChange.emit).toHaveBeenCalledWith([tag]);
    expect(component.inputValue).toBe('');
    expect(component.isOpen()).toBeFalse();
  });

  it('should remove a tag', () => {
    const tag1 = { id: '1', name: 'Bug', color: '#ff0000', usedIn: [] };
    const tag2 = { id: '2', name: 'Feature', color: '#00ff00', usedIn: [] };
    componentRef.setInput('selectedTags', [tag1, tag2]);

    spyOn(component.tagsChange, 'emit');
    component.removeTag(tag1);

    expect(component.tagsChange.emit).toHaveBeenCalledWith([tag2]);
  });

  it('should add an existing tag from input', () => {
    spyOn(component.tagsChange, 'emit');
    spyOn(component.tagCreated, 'emit');

    component.inputValue = ' Bug ';
    component.addTagFromInput();

    expect(component.tagsChange.emit).toHaveBeenCalled();
    expect(component.tagCreated.emit).not.toHaveBeenCalled();
    expect(component.inputValue).toBe('');
  });

  it('should create a new tag from input if it does not exist', () => {
    spyOn(component.tagsChange, 'emit');
    spyOn(component.tagCreated, 'emit');

    component.inputValue = 'NewTag';
    component.addTagFromInput();

    expect(component.tagCreated.emit).toHaveBeenCalledWith('NewTag');
    expect(component.tagsChange.emit).not.toHaveBeenCalled();
    expect(component.inputValue).toBe('');
  });
});
