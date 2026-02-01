---
description: Generate a new Angular component following OmniTask conventions
---

# Angular Component Generation Workflow

This workflow creates Angular components that follow OmniTask's coding standards and OmniFlex design system.

## Component Locations

| Type | Location | Example |
|------|----------|---------|
| Feature component | `src/app/features/{feature}/` | `features/tasks/task-card.component.ts` |
| Shared component | `src/app/shared/components/` | `shared/components/loading-spinner/` |
| Core component | `src/app/core/layout/` | `core/layout/sidebar.component.ts` |
| Modal | `src/app/features/{feature}/` | `features/tasks/task-detail-modal.component.ts` |

## Workflow Steps

### 1. Determine Component Location

Based on the component's purpose:
- **Feature-specific** → `src/app/features/{feature}/`
- **Reusable across features** → `src/app/shared/components/`
- **App-wide layout** → `src/app/core/layout/`

### 2. Generate Component Scaffold

```bash
# Generate standalone component
// turbo
ng generate component {path}/{name} --standalone --style=css
```

### 3. Update Component Class

Apply OmniTask patterns:

```typescript
import { Component, inject, signal, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-{name}',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './{name}.component.html',
  styleUrl: './{name}.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class {Name}Component {
  // Use inject() for DI
  private readonly someService = inject(SomeService);

  // Use signals for state
  loading = signal(false);
  items = signal<Item[]>([]);

  // Use input() for inputs
  data = input<DataType>();

  // Use output() for outputs  
  itemSelected = output<Item>();

  // Use computed for derived state
  itemCount = computed(() => this.items().length);
}
```

### 4. Apply OmniFlex Styling

Add to component CSS:

```css
/* Base card styling with glassmorphism */
.card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1.5rem;
}

/* Hover effects */
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
}

/* Primary button */
.btn-primary {
  background: linear-gradient(135deg, #8b5cf6, #3b82f6);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.4);
}
```

### 5. Add Template Structure

Use Angular's control flow syntax:

```html
@if (loading()) {
  <div class="loading-spinner">
    <div class="spinner"></div>
  </div>
} @else if (items().length === 0) {
  <div class="empty-state">
    <p>No items found</p>
    <button class="btn-primary" (click)="onCreate()">Create First Item</button>
  </div>
} @else {
  @for (item of items(); track item.id) {
    <div class="item-card" (click)="itemSelected.emit(item)">
      {{ item.name }}
    </div>
  }
}
```

### 6. Add to Routing (if needed)

For routable components, add to `app.routes.ts`:

```typescript
{
  path: '{route}',
  loadComponent: () => import('./features/{feature}/{name}.component')
    .then(m => m.{Name}Component),
},
```

## Component Checklist

- [ ] Uses `standalone: true`
- [ ] Uses `inject()` for DI
- [ ] Uses signals for reactive state
- [ ] Uses `ChangeDetectionStrategy.OnPush`
- [ ] Follows OmniFlex dark theme styling
- [ ] Has loading and empty states
- [ ] Has proper TypeScript types (no `any`)
