/** Indian mobile numbers: accepts "98450 12345", "+91 98450 12345", "098450-12345". */
export function normalizeIndianPhone(input: string): string | null {
  let digits = input.replace(/[^\d]/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

/** +919845012345 → +91 98450 12345 */
export function formatPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

export const PHONE_ERROR = "Enter a 10-digit Indian mobile number, like 98450 12345.";
