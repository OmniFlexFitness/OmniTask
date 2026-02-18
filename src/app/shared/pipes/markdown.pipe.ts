import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked, Renderer } from 'marked';

/**
 * Custom marked extensions for Obsidian-style features:
 * - ==highlight== syntax
 * - Callout blocks (> [!NOTE], > [!TIP], > [!WARNING], > [!IMPORTANT], > [!CAUTION])
 */

// Configure marked with GFM + Obsidian extensions
const calloutRegex =
  /^<blockquote>\s*<p>\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION|INFO|DANGER|BUG|EXAMPLE|QUOTE|FAQ|SUCCESS|FAILURE|ABSTRACT|TODO)\](?:\s*(.*?))?\s*<\/p>/i;

const calloutIcons: Record<string, string> = {
  NOTE: '📝',
  TIP: '💡',
  WARNING: '⚠️',
  IMPORTANT: '❗',
  CAUTION: '🔥',
  INFO: 'ℹ️',
  DANGER: '☠️',
  BUG: '🐛',
  EXAMPLE: '📋',
  QUOTE: '💬',
  FAQ: '❓',
  SUCCESS: '✅',
  FAILURE: '❌',
  ABSTRACT: '📄',
  TODO: '☑️',
};

const calloutColors: Record<string, string> = {
  NOTE: 'border-blue-500/40 bg-blue-500/5',
  TIP: 'border-emerald-500/40 bg-emerald-500/5',
  WARNING: 'border-amber-500/40 bg-amber-500/5',
  IMPORTANT: 'border-purple-500/40 bg-purple-500/5',
  CAUTION: 'border-rose-500/40 bg-rose-500/5',
  INFO: 'border-cyan-500/40 bg-cyan-500/5',
  DANGER: 'border-red-600/40 bg-red-600/5',
  BUG: 'border-red-500/40 bg-red-500/5',
  EXAMPLE: 'border-violet-500/40 bg-violet-500/5',
  QUOTE: 'border-slate-400/40 bg-slate-400/5',
  FAQ: 'border-orange-500/40 bg-orange-500/5',
  SUCCESS: 'border-green-500/40 bg-green-500/5',
  FAILURE: 'border-red-500/40 bg-red-500/5',
  ABSTRACT: 'border-indigo-500/40 bg-indigo-500/5',
  TODO: 'border-cyan-500/40 bg-cyan-500/5',
};

/**
 * Parse raw markdown to HTML with GFM + Obsidian extensions.
 */
function parseMarkdown(source: string): string {
  if (!source?.trim()) return '';

  // Pre-process: ==highlight== → <mark>
  let processed = source.replace(/==(.*?)==/g, '<mark class="md-highlight">$1</mark>');

  // Parse with marked (GFM enabled by default in v17+)
  let html = marked.parse(processed, { async: false, gfm: true, breaks: true }) as string;

  // Post-process: Obsidian-style callouts
  html = html.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION|INFO|DANGER|BUG|EXAMPLE|QUOTE|FAQ|SUCCESS|FAILURE|ABSTRACT|TODO)\](?:\s*(.*?))?\s*<\/p>([\s\S]*?)<\/blockquote>/gi,
    (_match, type: string, title: string, body: string) => {
      const upper = type.toUpperCase();
      const icon = calloutIcons[upper] || '📝';
      const colors = calloutColors[upper] || 'border-slate-500/40 bg-slate-500/5';
      const displayTitle = title?.trim() || upper.charAt(0) + upper.slice(1).toLowerCase();
      return `<div class="md-callout ${colors} border-l-4 rounded-r-lg px-4 py-3 my-3">
        <div class="font-semibold text-sm mb-1">${icon} ${displayTitle}</div>
        <div class="text-sm text-slate-300">${body.trim()}</div>
      </div>`;
    },
  );

  return html;
}

/**
 * Renders markdown content to safe HTML.
 *
 * Usage: `<div [innerHTML]="description | markdown"></div>`
 *
 * Supports:
 * - GitHub Flavored Markdown (tables, strikethrough, task lists, autolinks)
 * - Obsidian-style callouts (> [!NOTE], > [!TIP], etc.)
 * - Obsidian-style highlights (==text==)
 * - Code blocks, blockquotes, headings, lists, links, images
 */
@Pipe({
  name: 'markdown',
  standalone: true,
  pure: true,
})
export class MarkdownPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    if (!value?.trim()) return '';
    const html = parseMarkdown(value);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}

/**
 * Renders markdown but strips to plain text (for previews / truncated snippets).
 *
 * Usage: `{{ description | markdownPlain }}`
 */
@Pipe({
  name: 'markdownPlain',
  standalone: true,
  pure: true,
})
export class MarkdownPlainPipe implements PipeTransform {
  transform(value: string | null | undefined, maxLength = 120): string {
    if (!value?.trim()) return '';
    const html = parseMarkdown(value);
    // Strip HTML tags to get plain text
    const plain = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return plain.length > maxLength ? plain.substring(0, maxLength) + '…' : plain;
  }
}
