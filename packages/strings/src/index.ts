/** Substitute named values without interpreting replacement characters. */
export function formatCopy(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (token, name: string) => String(values[name] ?? token));
}
