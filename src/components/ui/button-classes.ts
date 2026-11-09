import { cn } from "./cn";

export type Variant = "accent" | "primary" | "secondary" | "ghost" | "danger" | "on-brand";
export type Size = "sm" | "md" | "lg";

/**
 * Button recipe. `accent` (gold) is reserved for the one main action on a screen
 * (Checkout, Place order). `primary` is maroon, `secondary` outlined.
 */
export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center gap-2 rounded-sm border font-sans font-semibold leading-none no-underline select-none",
    "transition-[background-color,border-color,color,transform] duration-(--dur-quick) ease-glyph",
    !className?.includes("justify-") && "justify-center",
    "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45",
    size === "sm" && "min-h-11 px-3.5 text-small pointer-fine:min-h-9",
    size === "md" && "min-h-11 px-5 text-body",
    size === "lg" && "min-h-13 px-6 text-body",
    variant === "accent" && "border-transparent bg-accent text-on-accent hover:bg-[color-mix(in_oklch,var(--accent)_88%,var(--ink))]",
    variant === "primary" && "border-transparent bg-brand text-on-brand hover:bg-brand-deep",
    variant === "secondary" && "border-line-strong bg-paper-raised text-ink hover:border-ink",
    variant === "ghost" && "border-transparent bg-transparent text-ink hover:bg-paper-sunken",
    variant === "danger" && "border-danger bg-transparent text-danger hover:bg-danger-soft",
    variant === "on-brand" && "border-on-brand-2/50 bg-transparent text-on-brand hover:border-on-brand hover:bg-white/5",
    className,
  );
}
