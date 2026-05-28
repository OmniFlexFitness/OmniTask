/**
 * Column order written to the spreadsheet. Row 1 holds these headers; each
 * subsequent row is one task.
 */
export const SHEET_HEADERS = [
  'Title',
  'Section',
  'Order',
  'Status',
  'Priority',
  'Due Date',
  'Assignees',
  'Tags',
  'Description',
  'ID',
  'Updated At',
] as const;

export type SheetColumn = (typeof SHEET_HEADERS)[number];

/** 0-based column index for the given header name. */
export function sheetHeaderIndex(name: SheetColumn): number {
  return SHEET_HEADERS.indexOf(name);
}
