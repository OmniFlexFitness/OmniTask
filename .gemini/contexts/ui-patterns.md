# OmniFlex UI Pattern Library

This document provides UI patterns and CSS snippets following the OmniFlex design system.

## Design Principles

| Principle | Description |
|-----------|-------------|
| **Dark First** | Dark mode is the default, light mode optional |
| **Glassmorphism** | Frosted glass effects on overlays and cards |
| **Neon Accents** | Purple/cyan glows on interactive elements |
| **Micro-animations** | Subtle motion for responsiveness |
| **Premium Feel** | State-of-the-art, futuristic aesthetic |

## Color Tokens

### CSS Custom Properties

```css
:root {
  /* Primary Colors */
  --color-primary: #8b5cf6;
  --color-primary-light: #a78bfa;
  --color-primary-dark: #7c3aed;
  
  /* Secondary Colors */
  --color-blue: #3b82f6;
  --color-blue-light: #60a5fa;
  --color-blue-dark: #2563eb;
  
  /* Accent */
  --color-accent: #06b6d4;
  --color-accent-glow: #22d3ee;
  
  /* Gradients */
  --gradient-primary: linear-gradient(135deg, #8b5cf6, #3b82f6);
  --gradient-accent: linear-gradient(135deg, #8b5cf6, #06b6d4);
  
  /* Backgrounds */
  --bg-base: #0a0a0f;
  --bg-surface: #111118;
  --bg-elevated: #1a1a24;
  --bg-glass: rgba(255, 255, 255, 0.05);
  
  /* Text */
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  
  /* Status */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  
  /* Borders */
  --border-subtle: rgba(255, 255, 255, 0.1);
  --border-strong: rgba(255, 255, 255, 0.2);
}
```

## Component Patterns

### Glass Panel (Card)

```css
.glass-panel {
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 1.5rem;
}

.glass-panel:hover {
  border-color: var(--border-strong);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
```

### Primary Button

```css
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  
  background: var(--gradient-primary);
  color: white;
  
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  
  font-weight: 500;
  font-size: 0.875rem;
  
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.4);
}

.btn-primary:active {
  transform: scale(0.98);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
```

### Secondary Button

```css
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  
  background: transparent;
  color: var(--text-secondary);
  
  padding: 0.75rem 1.5rem;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: var(--bg-glass);
  border-color: var(--border-strong);
  color: var(--text-primary);
}
```

### Danger Button

```css
.btn-danger {
  background: var(--color-error);
  color: white;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-danger:hover {
  background: #dc2626;
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
}
```

### Input Field

```css
.input {
  width: 100%;
  background: var(--bg-surface);
  color: var(--text-primary);
  
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  
  font-size: 0.875rem;
  transition: all 0.2s ease;
}

.input::placeholder {
  color: var(--text-muted);
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2);
}

.input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### Modal

```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 100;
  
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  
  animation: modalSlideIn 0.2s ease;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid var(--border-subtle);
}

.modal-body {
  padding: 1.5rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-subtle);
}
```

### Loading Spinner

```css
.loading-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-subtle);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

### Empty State

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  
  padding: 3rem;
  text-align: center;
}

.empty-state-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.empty-state-description {
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
  max-width: 300px;
}
```

### Toast Notification

```css
.toast {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  
  display: flex;
  align-items: center;
  gap: 0.75rem;
  
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 1rem 1.5rem;
  
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  
  animation: toastSlideIn 0.3s ease;
  z-index: 200;
}

@keyframes toastSlideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.toast-success {
  border-left: 3px solid var(--color-success);
}

.toast-error {
  border-left: 3px solid var(--color-error);
}

.toast-warning {
  border-left: 3px solid var(--color-warning);
}
```

### Form Validation

```css
.form-group {
  margin-bottom: 1.25rem;
}

.form-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.input-error {
  border-color: var(--color-error) !important;
}

.error-message {
  font-size: 0.75rem;
  color: var(--color-error);
  margin-top: 0.25rem;
}
```

### Task Card

```css
.task-card {
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 1rem;
  
  cursor: pointer;
  transition: all 0.2s ease;
}

.task-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-strong);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.task-card.dragging {
  opacity: 0.5;
  transform: rotate(3deg);
}

.task-card.drop-target {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.3);
}
```

### Priority Badge

```css
.priority-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  
  font-size: 0.75rem;
  font-weight: 500;
}

.priority-high {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}

.priority-medium {
  background: rgba(245, 158, 11, 0.2);
  color: #fcd34d;
}

.priority-low {
  background: rgba(107, 114, 128, 0.2);
  color: #9ca3af;
}
```

### Tag Chip

```css
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
  
  font-size: 0.75rem;
  background: var(--tag-color, var(--color-primary));
  color: white;
}

.tag-chip-removable {
  padding-right: 0.25rem;
}

.tag-chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  
  background: rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: background 0.2s;
}

.tag-chip-remove:hover {
  background: rgba(0, 0, 0, 0.4);
}
```

## Animation Utilities

```css
/* Fade in */
.animate-fade-in {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Scale in */
.animate-scale-in {
  animation: scaleIn 0.2s ease;
}

@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* Slide up */
.animate-slide-up {
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* Pulse glow */
.animate-pulse-glow {
  animation: pulseGlow 2s ease-in-out infinite;
}

@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 5px rgba(139, 92, 246, 0.3); }
  50% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.6); }
}
```
