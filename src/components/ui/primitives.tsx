import type { ButtonHTMLAttributes, ReactNode } from "react";
import { forwardRef, useEffect, useId, useRef } from "react";
import { buttonClasses, type Size, type Variant } from "./button-classes";
import { cn } from "./cn";
import { Icon, type IconName } from "./icons";

// ---- Button -------------------------------------------------------------------

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean; icon?: IconName }
>(function Button({ variant = "primary", size = "md", busy, icon, className, children, disabled, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Spinner /> : icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}
      {children}
    </button>
  );
});

export function IconButton({
  icon,
  label,
  className,
  size = 20,
  ...rest
}: { icon: IconName; label: string; size?: number } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-ink-2 transition-colors duration-(--dur-quick) hover:bg-paper-sunken hover:text-ink disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      className={cn("size-4 animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---- Switch (role="switch", WAI-ARIA pattern) -----------------------------------

export function Switch({
  checked,
  onChange,
  label,
  hideLabel,
  disabled,
  busy,
  description,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
  busy?: boolean;
  description?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={hideLabel ? label : undefined}
        aria-labelledby={hideLabel ? undefined : `${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        aria-busy={busy || undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill border transition-colors duration-(--dur-quick)",
          "before:absolute before:-inset-2 before:content-['']",
          checked ? "border-ok bg-ok" : "border-line-strong bg-paper-sunken",
          disabled && "opacity-50",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-pill bg-paper-raised shadow-sm transition-transform duration-(--dur-quick) ease-glyph",
            checked ? "translate-x-6 text-ok" : "translate-x-1 text-ink-3",
          )}
        >
          {busy ? <Spinner className="size-3" /> : checked ? <Icon name="check" size={13} strokeWidth={2.5} /> : null}
        </span>
      </button>
      {!hideLabel && (
        <span className="grid">
          <span id={`${id}-label`} className="text-small font-semibold text-ink">
            {label}
          </span>
          {description && (
            <span id={`${id}-desc`} className="text-small text-ink-3">
              {description}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// ---- Dialog (native <dialog>: focus trap, Esc and inert background for free) --------

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else {
        // iOS 15.0–15.3 and other browsers without <dialog>: show it as a fixed sheet.
        d.setAttribute("open", "");
        d.classList.add("sheet-fallback");
      }
      // Start on the title (read out by screen readers) instead of the Close button,
      // which Safari would otherwise draw a focus ring around on touch screens.
      titleRef.current?.focus();
    }
    if (!open && d.hasAttribute("open")) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);

  return (
    // Backdrop click is a pointer convenience; keyboard users close with Esc (native cancel) or the Close button.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className={cn("sheet", wide && "sheet-wide")}
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 pt-4 pb-3">
            <div className="grid gap-0.5 pt-1.5">
              <h2 id={`${id}-title`} ref={titleRef} tabIndex={-1} className="m-0 font-display text-title font-semibold outline-none">
                {title}
              </h2>
              {description && <div className="text-small text-ink-2">{description}</div>}
            </div>
            <IconButton icon="x" label="Close" onClick={onClose} className="-mr-2" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ---- Small display pieces -------------------------------------------------------------

/** The Indian vegetarian mark: green square with a dot. */
export function VegMark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Vegetarian"
      className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] border-veg", className)}
    >
      <span className="size-2 rounded-pill bg-veg" />
    </span>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
  live,
}: {
  tone?: "info" | "ok" | "warn" | "danger";
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  live?: boolean;
}) {
  const icon: IconName = tone === "ok" ? "check" : tone === "info" ? "info" : "alert";
  return (
    <div
      role={live ? (tone === "danger" ? "alert" : "status") : undefined}
      className={cn(
        "flex items-start gap-3 rounded-md border px-4 py-3 text-small",
        tone === "info" && "border-line bg-paper-sunken text-ink",
        tone === "ok" && "border-ok/40 bg-ok-soft text-ink",
        tone === "warn" && "border-warn/40 bg-warn-soft text-ink",
        tone === "danger" && "border-danger/40 bg-danger-soft text-ink",
        className,
      )}
    >
      <Icon
        name={icon}
        size={18}
        className={cn(
          "mt-0.5 shrink-0",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "danger" && "text-danger",
          tone === "info" && "text-ink-2",
        )}
      />
      <div className="grid min-w-0 flex-1 gap-0.5">
        {title && <p className="m-0 font-semibold">{title}</p>}
        {children && <div className="text-ink-2">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-ink-2">
      <Spinner className="size-5" />
      <span>{label}…</span>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Notice
      tone="danger"
      title="That did not load."
      live
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {message}
    </Notice>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "danger" | "accent"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-label font-semibold",
        tone === "neutral" && "bg-paper-sunken text-ink-2",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "accent" && "bg-accent text-on-accent",
      )}
    >
      {children}
    </span>
  );
}

export function QtyStepper({
  qty,
  onChange,
  name,
  max = 50,
  min = 0,
}: {
  qty: number;
  onChange: (qty: number) => void;
  name: string;
  max?: number;
  /** 0 = the minus button removes the line at quantity 1; 1 = it stops at one. */
  min?: number;
}) {
  const removes = min === 0 && qty === 1;
  return (
    <div className="inline-flex items-center rounded-sm border border-line-strong bg-paper-raised" role="group" aria-label={`Quantity of ${name}`}>
      <button
        type="button"
        className="inline-flex size-11 items-center justify-center rounded-l-sm text-ink hover:bg-paper-sunken disabled:opacity-40 pointer-fine:size-9"
        aria-label={removes ? `Remove ${name}` : `One less ${name}`}
        disabled={min > 0 && qty <= min}
        onClick={() => onChange(qty - 1)}
      >
        <Icon name={removes ? "trash" : "minus"} size={16} />
      </button>
      <span className="num min-w-7 text-center text-small font-semibold" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        className="inline-flex size-11 items-center justify-center rounded-r-sm text-ink hover:bg-paper-sunken disabled:opacity-40 pointer-fine:size-9"
        aria-label={`One more ${name}`}
        disabled={qty >= max}
        onClick={() => onChange(qty + 1)}
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
