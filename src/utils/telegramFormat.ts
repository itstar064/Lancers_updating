/** Telegram HTML mode: escape user-controlled text. */
export const escapeTelegramHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `href` attribute: `&` must be escaped for HTML parse mode. */
export const escapeHref = (s: string) => s.replace(/&/g, "&amp;");

/**
 * 長文を Telegram の上限（~4096）前後で分割
 */
export const splitTextForTelegram = (s: string, maxChunk = 3600) => {
  if (s.length <= maxChunk) {
    return [s];
  }
  const out: string[] = [];
  for (let i = 0; i < s.length; i += maxChunk) {
    out.push(s.slice(i, i + maxChunk));
  }
  return out;
};
