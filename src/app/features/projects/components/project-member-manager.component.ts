import { Component, input, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project.service';
import { ContactsService } from '../../../core/services/contacts.service';
import { Contact } from '../../../core/models/contact.model';
import { DialogService } from '../../../core/services/dialog.service';
import { Project } from '../../../core/models/domain.model';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, switchMap, map, startWith } from 'rxjs';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-member-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './project-member-manager.component.html',
})
export class ProjectMemberManagerComponent {
  project = input.required<Project>();

  projectService = inject(ProjectService);
  contactsService = inject(ContactsService);
  dialogService = inject(DialogService);

  // Search Control
  searchControl = new FormControl('');
  showResults = signal(false);

  // Contacts Data (All users map)
  allContacts = toSignal(this.contactsService.getContacts(), { initialValue: [] });

  // Filtered Search Results
  searchResults = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      switchMap((term) => this.contactsService.searchContacts(term || '')),
    ),
    { initialValue: [] },
  );

  // Computed Lists based on Project Data and All Contacts
  admins = computed(() => {
    const p = this.project();
    const contacts = this.allContacts();
    return contacts.filter((c) => c.id === p.ownerId);
  });

  members = computed(() => {
    const p = this.project();
    const contacts = this.allContacts();
    // Members are in memberIds but NOT the owner
    return contacts.filter((c) => p.memberIds.includes(c.id) && c.id !== p.ownerId);
  });

  isMember(userId: string): boolean {
    return this.project().memberIds.includes(userId);
  }

  async addMember(user: Contact) {
    this.searchControl.setValue('');
    this.showResults.set(false);

    try {
      await this.projectService.addMember(this.project().id, user.id);
    } catch (err) {
      console.error('Failed to add member', err);
    }
  }

  async removeMember(userId: string) {
    if (
      !(await this.dialogService.confirm(
        'Are you sure you want to remove this member from the project?',
        'Remove Member',
      ))
    )
      return;

    try {
      await this.projectService.removeMember(this.project().id, userId);
    } catch (err) {
      console.error('Failed to remove member', err);
    }
  }

  /**
   * Generate a consistent color for avatars based on email
   */
  getAvatarColor(email: string): string {
    const colors = [
      '#8b5cf6',
      '#3b82f6',
      '#06b6d4',
      '#10b981',
      '#f59e0b',
      '#ef4444',
      '#ec4899',
      '#6366f1',
      '#14b8a6',
      '#f97316',
    ];
    const hash = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  /**
   * Get initials from display name
   */
  getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2);
  }
}
