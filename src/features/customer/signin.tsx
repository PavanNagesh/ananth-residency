import type { ConfirmationResult } from "firebase/auth";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { formatPhone, normalizeIndianPhone, PHONE_ERROR } from "../../../shared/phone";
import type { Customer } from "../../../shared/types";
import { TextField } from "../../components/ui/field";
import { Button, Notice } from "../../components/ui/primitives";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useCustomer } from "../../lib/auth";
import { confirmFirebaseCode, firebaseConfigured, sendFirebaseCode } from "../../lib/firebase";
import { PagePanel } from "./layout";

type Step = { kind: "phone" } | { kind: "code"; phone: string; confirmation: ConfirmationResult | null } | { kind: "name" };

/** Phone → SMS code → (first time) name. Calls onDone once the customer is signed in with a name. */
export function SignInForm({ onDone }: { onDone?: (c: Customer) => void }) {
  const { setCustomer } = useCustomer();
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const devMode = !firebaseConfigured;

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step.kind === "code") codeRef.current?.focus();
    if (step.kind === "name") nameRef.current?.focus();
  }, [step.kind]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    const e164 = normalizeIndianPhone(phone);
    if (!e164) return setError(PHONE_ERROR);
    setError(null);
    setBusy(true);
    try {
      let confirmation: ConfirmationResult | null = null;
      if (!devMode) {
        confirmation = await sendFirebaseCode(e164, "recaptcha-anchor");
      }
      setCode("");
      setStep({ kind: "code", phone: e164, confirmation });
      setResendIn(30);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (step.kind !== "code") return;
    if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from the SMS.");
    setError(null);
    setBusy(true);
    try {
      let customer: Customer;
      if (step.confirmation) {
        const idToken = await confirmFirebaseCode(step.confirmation, code.trim());
        customer = (await api<{ customer: Customer }>("/auth/firebase", { body: { idToken } })).customer;
      } else {
        customer = (await api<{ customer: Customer }>("/auth/dev-otp", { body: { phone: step.phone, code: code.trim() } })).customer;
      }
      setCustomer(customer);
      if (!customer.name) setStep({ kind: "name" });
      else onDone?.(customer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Enter your name so the restaurant knows who to ask for.");
    setError(null);
    setBusy(true);
    try {
      const { customer } = await api<{ customer: Customer }>("/me", { method: "PUT", body: { name: name.trim() } });
      setCustomer(customer);
      onDone?.(customer);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {step.kind === "phone" && (
        <form onSubmit={sendCode} noValidate className="grid gap-4">
          <TextField
            label="Mobile number"
            prefix="+91"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={error ?? undefined}
            hint="We send a 6-digit code by SMS. The restaurant calls this number to confirm your order."
            placeholder="98450 12345"
            maxLength={14}
          />
          <Button type="submit" variant="primary" size="lg" busy={busy} id="send-code">
            Send code
          </Button>
        </form>
      )}

      {step.kind === "code" && (
        <form onSubmit={verify} noValidate className="grid gap-4">
          <p className="m-0 text-small text-ink-2">
            Code sent to <strong className="text-ink">{formatPhone(step.phone)}</strong>.{" "}
            <button type="button" className="font-semibold text-accent-text underline" onClick={() => setStep({ kind: "phone" })}>
              Change number
            </button>
          </p>
          {devMode && (
            <Notice tone="info" title="Development sign-in">
              Phone sign-in is not connected to Firebase yet. Use the code 123456.
            </Notice>
          )}
          <TextField
            ref={codeRef}
            label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            error={error ?? undefined}
            maxLength={6}
          />
          <Button type="submit" variant="primary" size="lg" busy={busy}>
            Verify and continue
          </Button>
          <Button variant="ghost" size="sm" disabled={resendIn > 0 || busy} onClick={() => void sendCode()}>
            {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          </Button>
        </form>
      )}

      {step.kind === "name" && (
        <form onSubmit={saveName} noValidate className="grid gap-4">
          <p className="m-0 text-small text-ink-2">You are signed in. One more thing for your first order.</p>
          <TextField
            ref={nameRef}
            label="Your name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error ?? undefined}
            maxLength={60}
          />
          <Button type="submit" variant="primary" size="lg" busy={busy}>
            Save and continue
          </Button>
        </form>
      )}
      {/* Firebase attaches its invisible reCAPTCHA here. */}
      <div id="recaptcha-anchor" />
    </div>
  );
}

export function SignInPage() {
  const { customer, ready } = useCustomer();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/";
  if (ready && customer?.name) return <Navigate to={next} replace />;
  return (
    <PagePanel title="Sign in" back={{ to: "/", label: "Back to menu" }}>
      <SignInForm onDone={() => navigate(next, { replace: true })} />
    </PagePanel>
  );
}
