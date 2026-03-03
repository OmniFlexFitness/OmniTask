import {
  Component,
  forwardRef,
  input,
  signal,
  computed,
  HostListener,
  ElementRef,
  inject,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption {
  value: string;
  label: string;
  icon?: string;
  colorClass?: string;
}

@Component({
  selector: 'app-custom-select',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomSelectComponent),
      multi: true,
    },
  ],
  template: `
    <div class="relative w-full" [class.opacity-50]="disabled()">
      <!-- Trigger -->
      <button
        type="button"
        (click)="toggleOpen()"
        [disabled]="disabled()"
        class="w-full h-[38px] flex items-center justify-between bg-slate-950/50 border rounded-lg px-3 py-2 text-sm transition-all duration-200"
        [ngClass]="{
          'border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.2)]': isOpen(),
          'border-white/10 hover:border-white/20': !isOpen(),
        }"
      >
        <div class="flex items-center gap-2 truncate">
          @if (selectedOption(); as opt) {
            @if (opt.icon) {
              <span>{{ opt.icon }}</span>
            } @else if (opt.colorClass) {
              <span
                class="w-2.5 h-2.5 rounded-full shadow-[0_0_5px_currentColor] {{ opt.colorClass }}"
              ></span>
            }
            <span class="text-slate-200 truncate">{{ opt.label }}</span>
          } @else {
            <span class="text-slate-500">{{ placeholder() }}</span>
          }
        </div>

        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 text-slate-400 transition-transform duration-200"
          [class.rotate-180]="isOpen()"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <!-- Dropdown Menu -->
      @if (isOpen()) {
        <div
          class="absolute z-50 w-full mt-2 bg-[#0a0f1e]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden origin-top animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div class="max-h-60 overflow-y-auto p-1.5 custom-scrollbar">
            @for (opt of options(); track opt.value) {
              <button
                type="button"
                (click)="selectOption(opt)"
                class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-all duration-150 relative overflow-hidden group"
                [ngClass]="{
                  'bg-cyan-500/10 text-cyan-300': opt.value === value(),
                  'text-slate-300 hover:bg-white/5 hover:text-white': opt.value !== value(),
                }"
              >
                <!-- Selection indicator flare -->
                @if (opt.value === value()) {
                  <div
                    class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-cyan-400 rounded-r-full shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                  ></div>
                }

                @if (opt.icon) {
                  <span>{{ opt.icon }}</span>
                } @else if (opt.colorClass) {
                  <span
                    class="w-2.5 h-2.5 rounded-full shadow-[0_0_5px_currentColor] transition-transform group-hover:scale-125 {{
                      opt.colorClass
                    }}"
                  ></span>
                }

                <span class="truncate flex-1" [class.font-medium]="opt.value === value()">
                  {{ opt.label }}
                </span>

                @if (opt.value === value()) {
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 text-cyan-400 ml-auto"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                }
              </button>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
      }
      .custom-scrollbar::-webkit-scrollbar-track {
        background: rgba(5, 8, 16, 0.6);
        border-radius: 4px;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, rgba(0, 210, 255, 0.5), rgba(165, 100, 255, 0.5));
        border-radius: 4px;
        box-shadow:
          0 0 6px rgba(0, 210, 255, 0.4),
          0 0 12px rgba(165, 100, 255, 0.2);
      }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, rgba(0, 210, 255, 0.7), rgba(165, 100, 255, 0.7));
        box-shadow:
          0 0 10px rgba(0, 210, 255, 0.6),
          0 0 20px rgba(165, 100, 255, 0.4);
      }
    `,
  ],
})
export class CustomSelectComponent implements ControlValueAccessor {
  options = input.required<SelectOption[]>();
  placeholder = input<string>('Select an option');

  value = signal<string | null>(null);
  valueChange = output<string>();

  isOpen = signal(false);
  disabled = signal(false);

  private readonly elementRef = inject(ElementRef);

  selectedOption = computed(() => {
    const val = this.value();
    return this.options().find((o) => o.value === val) || null;
  });

  onChange: any = () => {};
  onTouch: any = () => {};

  @HostListener('document:click', ['$event'])
  clickout(event: Event) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.close();
    }
  }

  toggleOpen() {
    if (this.disabled()) return;
    this.isOpen.update((v) => !v);
  }

  close() {
    if (this.isOpen()) {
      this.isOpen.set(false);
      this.onTouch();
    }
  }

  selectOption(option: SelectOption) {
    this.value.set(option.value);
    this.onChange(option.value);
    this.valueChange.emit(option.value);
    this.close();
  }

  // ControlValueAccessor methods
  writeValue(obj: any): void {
    this.value.set(obj);
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouch = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
