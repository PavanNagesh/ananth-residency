/**
 * Staff password rules: at least 8 characters, not a commonly guessed password,
 * and not built from the person's own phone number or name.
 */
const COMMON = new Set([
  "password", "password1", "password123", "passw0rd", "12345678", "123456789", "1234567890", "11111111",
  "00000000", "87654321", "qwerty123", "qwertyuiop", "asdfghjkl", "iloveyou", "welcome1", "welcome123",
  "admin123", "administrator", "letmein1", "abcd1234", "abc12345", "1q2w3e4r", "india123", "bharat123",
  "restaurant", "restaurant1", "hotel123", "ananth123", "ananthresidency", "residency", "hubli123",
  "hubballi", "owner123", "staff123", "manager1", "changeme", "default1", "football", "cricket123",
]);

export function passwordProblem(password: string, personal: { phone?: string; name?: string } = {}): string | null {
  const p = password.toLowerCase();
  if (password.length < 8) return "Use at least 8 characters for the password.";
  if (COMMON.has(p) || COMMON.has(p.replace(/[^a-z0-9]/g, ""))) return "That password is too easy to guess. Choose another.";
  if (/^(.)\1+$/.test(password)) return "That password is too easy to guess. Choose another.";
  const digits = personal.phone?.replace(/\D/g, "").slice(-10);
  if (digits && digits.length === 10 && p.includes(digits.slice(-6))) return "Don't use your phone number in the password.";
  const first = personal.name?.trim().toLowerCase().split(/\s+/)[0];
  if (first && first.length >= 4 && p.includes(first)) return "Don't use your name in the password.";
  return null;
}
