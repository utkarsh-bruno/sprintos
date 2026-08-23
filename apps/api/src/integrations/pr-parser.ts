const URL_RE = /https?:\/\/github\.com\/[^\s)>"]+/gi;

export function parsePrUrls(value: unknown): string[] {
  if (typeof value === 'string') return [...new Set(value.match(URL_RE) ?? [])];
  if (value && typeof value === 'object' && 'url' in value && typeof (value as { url: unknown }).url === 'string') {
    return parsePrUrls((value as { url: string }).url);
  }
  if (Array.isArray(value)) return value.flatMap(parsePrUrls);
  return [];
}
