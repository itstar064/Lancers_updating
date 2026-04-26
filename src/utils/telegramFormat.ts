/** Telegram HTML mode: escape user-controlled text. */
export const escapeTelegramHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `href` attribute: `&` must be escaped for HTML parse mode. */
export const escapeHref = (s: string) => s.replace(/&/g, "&amp;");
