import type { SVGProps } from "react";

/** One stroke icon set (24 grid, 1.75 stroke, round joins). Decorative by default. */
const paths = {
  cart: "M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2 M9.5 20.5h.01 M17.5 20.5h.01",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  x: "M6 6l12 12 M18 6L6 18",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4",
  phone:
    "M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  check: "M5 12.5l4.5 4.5L19 7.5",
  chevronRight: "M9 6l6 6-6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronDown: "M6 9l6 6 6-6",
  pin: "M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7.5V12l3 2",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16z M10 20.5a2 2 0 0 0 4 0",
  bellOff: "M6 16V11a6 6 0 0 1 9.4-4.9 M18 11v5l1.5 2H8 M10 20.5a2 2 0 0 0 4 0 M4 4l16 16",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20a7.5 7.5 0 0 1 15 0",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3z M9 8h6 M9 12h6 M9 16h3",
  logout: "M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4 M10 16l-4-4 4-4 M6 12h10",
  edit: "M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4",
  trash: "M4 7h16 M9 7V4h6v3 M6.5 7l1 13h9l1-13",
  megaphone: "M3 10v4h3l7 4V6L6 10H3z M17 9a4 4 0 0 1 0 6",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-1.6.9L15 20.5h-4l-.5-2.2a7 7 0 0 1-1.6-.9l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-1.8L5 10.5l2-3.4 1.9.7a7 7 0 0 1 1.6-.9L11 4.5h4l.5 2.4a7 7 0 0 1 1.6.9l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 1.8z",
  list: "M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01",
  layers: "M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 14.5a6.5 6.5 0 0 1 3.5 5.5",
  refresh: "M20 11a8 8 0 0 0-14.6-4.5L4 8 M4 4v4h4 M4 13a8 8 0 0 0 14.6 4.5L20 16 M20 20v-4h-4",
  arrowLeft: "M19 12H5 M11 6l-6 6 6 6",
  arrowRight: "M5 12h14 M13 6l6 6-6 6",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 7.5h.01",
  tag: "M3 12V4h8l10 10-8 8L3 12z M7.5 8.5h.01",
  alert: "M12 3l10 18H2L12 3z M12 10v4 M12 17.5h.01",
  pause: "M8 5v14 M16 5v14",
  play: "M7 4l13 8-13 8V4z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1.5v2 M12 20.5v2 M1.5 12h2 M20.5 12h2 M4.6 4.6l1.4 1.4 M18 18l1.4 1.4 M4.6 19.4L6 18 M18 6l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  coffee: "M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z M17 10h1.5a2.5 2.5 0 0 1 0 5H17 M8 2.5v3 M12 2.5v3",
  utensils: "M7 3v8 M4.5 3v5a2.5 2.5 0 0 0 5 0V3 M7 11v10 M17 21V3c-2 1-3.5 3.5-3.5 7v3H17",
  wallet: "M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z M4 7l11-3v3 M16 13.5h.01",
  card: "M3 6h18v12H3V6z M3 10h18 M7 15h3",
  share: "M12 3v12 M8 7l4-4 4 4 M5 11v9h14v-9",
  download: "M12 4v11 M8 11l4 4 4-4 M5 20h14",
  copy: "M8 8h12v12H8V8z M16 8V4H4v12h4",
  addSquare: "M4 4h16v16H4V4z M12 8v8 M8 12h8",
  smartphone: "M7 2h10v20H7V2z M11 18.5h2",
  message: "M4 5h16v11H9l-5 4V5z",
  qr: "M4 4h6v6H4V4z M14 4h6v6h-6V4z M4 14h6v6H4v-6z M14 14h2v2h-2v-2z M18 18h2v2h-2v-2z M14 18h2 M18 14h2",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  label,
  ...rest
}: { name: IconName; size?: number; label?: string } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
      {...rest}
    >
      {paths[name].split(" M").map((d, i) => (
        <path key={i} d={i === 0 ? d : `M${d}`} />
      ))}
    </svg>
  );
}
