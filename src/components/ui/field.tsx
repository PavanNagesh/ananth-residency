import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { forwardRef, useId } from "react";
import { cn } from "./cn";

export const controlClasses =
  "w-full min-h-11 rounded-sm border border-line-strong bg-paper-raised px-3.5 py-2.5 font-sans text-body text-ink " +
  "placeholder:text-ink-3 transition-colors duration-(--dur-quick) focus-visible:border-ink focus-visible:outline-offset-1 " +
  "aria-invalid:border-danger disabled:opacity-60";

type Base = { label: ReactNode; error?: string; hint?: ReactNode; className?: string; prefix?: string };

function Wrapper({
  id,
  label,
  required,
  error,
  hint,
  className,
  children,
}: Base & { id: string; required?: boolean; children: ReactNode }) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <label htmlFor={id} className="text-small font-semibold text-ink">
        {label}
        {required && <span className="font-normal text-ink-3"> (required)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="m-0 text-small text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="m-0 text-small font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const describe = (id: string, error?: string, hint?: ReactNode) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

/** Labelled input with wired error/hint (WCAG 1.3.1, 3.3.1). Pass autoComplete for personal data (1.3.5). */
export const TextField = forwardRef<HTMLInputElement, Base & Omit<InputHTMLAttributes<HTMLInputElement>, "prefix">>(
  function TextField({ label, error, hint, className, required, prefix, ...rest }, ref) {
    const id = useId();
    const input = (
      <input
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe(id, error, hint)}
        className={cn(controlClasses, prefix && "rounded-l-none")}
        {...rest}
      />
    );
    return (
      <Wrapper id={id} label={label} error={error} hint={hint} required={required} className={className}>
        {prefix ? (
          <div className="flex">
            <span className="inline-flex min-h-11 items-center rounded-l-sm border border-r-0 border-line-strong bg-paper-sunken px-3 text-body font-medium text-ink-2">
              {prefix}
            </span>
            {input}
          </div>
        ) : (
          input
        )}
      </Wrapper>
    );
  },
);

export function TextArea({ label, error, hint, className, required, ...rest }: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <textarea
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe(id, error, hint)}
        className={cn(controlClasses, "min-h-24 resize-y")}
        {...rest}
      />
    </Wrapper>
  );
}

export function SelectField({
  label,
  error,
  hint,
  className,
  required,
  children,
  ...rest
}: Base & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe(id, error, hint)}
        className={controlClasses}
        {...rest}
      >
        {children}
      </select>
    </Wrapper>
  );
}
