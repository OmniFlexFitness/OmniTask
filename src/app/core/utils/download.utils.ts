export function downloadTextFile(options: {
  filename: string;
  text: string;
  mimeType?: string;
}): void {
  const { filename, text, mimeType = 'text/plain;charset=utf-8' } = options;
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(csvEscape).join(',');
  const body = rows
    .map((row) => columns.map((col) => csvEscape(row[col])).join(','))
    .join('\n');
  return `${header}\n${body}\n`;
}

