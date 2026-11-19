import { toTitleCase } from '../../scripts/lib/labelCase.mjs';

export { toTitleCase };

const RAW_VALUE = /^[a-z][a-z0-9_ -]*$/;

export function displayValue(text: string): string {
  const t = text.trim();
  return RAW_VALUE.test(t) ? toTitleCase(t.replace(/_+/g, ' ')) : text;
}
