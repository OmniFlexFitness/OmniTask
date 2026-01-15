import { Component, input, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project.service';
import { ContactsService, Contact } from '../../../core/services/contacts.service';
import { DialogService } from '../../../core/services/dialog.service';
import { Project } from '../../../core/models/domain.model';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, switchMap, map, startWith } from 'rxjs';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-project-member-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="space-y-6">
      <!-- Add Member Section -->
      <div class="bg-[#0f172a]/50 border border-white/5 rounded-xl p-4">
        <h3 class="text-sm font-bold text-white mb-3">Add Team Members</h3>

        <div class="relative">
          <div class="flex items-center gap-2">
            <div class="relative flex-grow">
              <input
                type="text"
                [formControl]="searchControl"
                placeholder="Search users by name or email..."
                class="w-full bg-[#050810] border border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                (focus)="showResults.set(true)"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          <!-- Helper text -->
          <p class="mt-2 text-xs text-slate-500">
            Search for people in your organization to add them to this project.
          </p>

          <!-- Search Results Dropdown -->
          @if (showResults() && searchResults().length > 0) {
          <div
            class="absolute top-full left-0 right-0 mt-2 bg-[#1e293b] border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto"
          >
            @for (user of searchResults(); track user.id) {
            <button
              (click)="addMember(user)"
              class="w-full text-left px-4 py-3 hover:bg-white/5 flex items-center gap-3 transition-colors border-b border-white/5 last:border-0"
              [disabled]="isMember(user.id)"
              [class.opacity-50]="isMember(user.id)"
              [class.cursor-not-allowed]="isMember(user.id)"
            >
              <img
                [src]="user.photoURL || 'assets/images/avatar-placeholder.png'"
                class="w-8 h-8 rounded-full bg-slate-800 object-cover"
                alt=""
              />
              <div>
                <div class="text-sm font-medium text-white">
                  {{ user.displayName }}
                  @if (isMember(user.id)) {
                  <span class="ml-2 text-xs text-emerald-400 font-normal">(Already a member)</span>
                  }
                </div>
                <div class="text-xs text-slate-400">{{ user.email }}</div>
              </div>
            </button>
            }
          </div>
          }
        </div>
      </div>

      <!-- Members List -->
      <div class="space-y-4">
        <!-- Admins (Owner) -->
        <div>
          <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            Project Admins
          </h3>
          <div class="space-y-2">
            @for (admin of admins(); track admin.id) {
            <div
              class="flex items-center justify-between p-3 bg-[#0f172a]/30 border border-emerald-500/20 rounded-lg group hover:border-emerald-500/40 transition-colors"
            >
              <div class="flex items-center gap-3">
                <div class="relative">
                  <img
                    [src]="admin.photoURL || 'assets/images/avatar-placeholder.png'"
                    class="w-10 h-10 rounded-full bg-slate-800 object-cover ring-2 ring-emerald-500/30"
                    alt=""
                  />
                  <div
                    class="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-[#0f172a]"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-2.5 w-2.5 text-[#050810]"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
                <div>
                  <div class="text-sm font-medium text-white flex items-center gap-2">
                    {{ admin.displayName }}
                    <span
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                      >OWNER</span
                    >
                  </div>
                  <div class="text-xs text-slate-400">{{ admin.email }}</div>
                </div>
              </div>
            </div>
            }
          </div>
        </div>

        <!-- Other Members -->
        <div>
          <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            Project Members
          </h3>
          @if (members().length === 0) {
          <div class="text-center py-6 border border-dashed border-slate-800 rounded-lg">
            <p class="text-sm text-slate-500">No additional members yet.</p>
          </div>
          } @else {
          <div class="space-y-2">
            @for (member of members(); track member.id) {
            <div
              class="flex items-center justify-between p-3 bg-[#0f172a]/30 border border-white/5 rounded-lg group hover:border-white/10 transition-colors"
            >
              <div class="flex items-center gap-3">
                <img
                  [src]="member.photoURL || 'assets/images/avatar-placeholder.png'"
                  class="w-10 h-10 rounded-full bg-slate-800 object-cover"
                  alt=""
                />
                <div>
                  <div class="text-sm font-medium text-white">{{ member.displayName }}</div>
                  <div class="text-xs text-slate-400">{{ member.email }}</div>
                </div>
              </div>

              <button
                (click)="removeMember(member.id)"
                class="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                title="Remove member"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
            }
          </div>
          }
        </div>
      </div>
    </div>
  `,
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
      switchMap((term) => this.contactsService.searchContacts(term || ''))
    ),
    { initialValue: [] }
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
    if (!(await this.dialogService.confirm('Are you sure you want to remove this member from the project?', 'Remove Member'))) return;

    try {
      await this.projectService.removeMember(this.project().id, userId);
    } catch (err) {
      console.error('Failed to remove member', err);
    }
  }
}
