
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/["\n\r,;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const head = headers.map(csvField).join(',');
  const body = rows.map((r) => headers.map((h) => csvField(r[h])).join(',')).join('\r\n');
  return rows.length ? `${head}\r\n${body}\r\n` : `${head}\r\n`;
}

export function xmlText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export function xmlName(raw: string): string {
  const s = raw.replace(/[^A-Za-z0-9_.-]/g, '_');
  return /^[A-Za-z_]/.test(s) ? s : `_${s}`;
}

export function toXml(
  rootName: string,
  itemName: string,
  headers: string[],
  rows: Array<Record<string, unknown>>,
): string {
  const root = xmlName(rootName);
  const item = xmlName(itemName);
  const body = rows.map((r) => {
    const fields = headers
      .map((h) => `    <${xmlName(h)}>${xmlText(r[h])}</${xmlName(h)}>`)
      .join('\n');
    return `  <${item}>\n${fields}\n  </${item}>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n${body}\n</${root}>\n`;
}
