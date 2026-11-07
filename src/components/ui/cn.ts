/** Join class names, skipping falsy values. Zero-dependency on purpose. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
