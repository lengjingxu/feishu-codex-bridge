const MAX_THREAD_TITLE_CHARS = 48;

export function threadTitleFromText(
  text: string | undefined,
  fallback = '飞书新会话',
): string {
  const normalized = text?.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  const chars = Array.from(normalized);
  return chars.length <= MAX_THREAD_TITLE_CHARS
    ? normalized
    : `${chars.slice(0, MAX_THREAD_TITLE_CHARS - 1).join('')}…`;
}
