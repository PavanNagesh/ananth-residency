/**
 * Where to go after signing in, from a `?next=` value anyone can put in a link.
 * Only a plain path on this site is allowed. "//evil.com", "/\evil.com", "https://…",
 * "javascript:…" and anything with unusual characters fall back to the menu.
 */
const SAFE_PATH = /^\/(?![\/\\])[\w\-.\/?=&%]*$/;

export function safeNextPath(value: string | null | undefined): string {
  return value && value.length <= 200 && SAFE_PATH.test(value) ? value : "/";
}
