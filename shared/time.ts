export const TIME_ZONE = "Asia/Kolkata";

const isoDate = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar date in India for a moment, as YYYY-MM-DD. */
export function istDate(d: Date = new Date()): string {
  return isoDate.format(d);
}

const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function formatTime(iso: string | Date): string {
  return timeFmt.format(new Date(iso));
}

export function formatDateTime(iso: string | Date): string {
  return dateTimeFmt.format(new Date(iso));
}

export function minutesAgo(iso: string | Date, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function formatOrderNo(seq: number): string {
  return `#${String(seq).padStart(3, "0")}`;
}
