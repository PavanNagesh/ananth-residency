import { Link } from "react-router";
import { BRAND } from "../lib/brand";
import { cn } from "./ui/cn";

/** Bilingual typographic wordmark after the hotel signboard: gold Kannada over the English name. */
export function Wordmark({ to = "/", size = "md", suffix }: { to?: string; size?: "sm" | "md"; suffix?: string }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-3 rounded-sm no-underline"
    >
      {BRAND.logo ? (
        <img src={BRAND.logo} alt="" aria-hidden="true" className={size === "sm" ? "h-9 w-auto" : "h-12 w-auto"} />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-sm border border-gold/60 bg-brand font-kannada font-semibold text-gold",
            size === "sm" ? "size-9 text-lg" : "size-11 text-xl",
          )}
        >
          ಅ
        </span>
      )}
      <span className="grid leading-none">
        <span lang="kn" className={cn("font-kannada font-medium text-gold", size === "sm" ? "text-[0.8rem]" : "text-[0.95rem]")}>
          {BRAND.nameKn}
        </span>
        <span
          className={cn(
            "mt-1 font-display font-semibold tracking-[0.08em] text-on-brand uppercase",
            size === "sm" ? "text-[0.8rem]" : "text-[1.05rem]",
          )}
        >
          {BRAND.nameEn}
          {suffix && <span className="ml-2 font-sans text-[0.75rem] font-medium tracking-normal text-on-brand-2 normal-case">{suffix}</span>}
        </span>
      </span>
      <span className="sr-only">, home</span>
    </Link>
  );
}
