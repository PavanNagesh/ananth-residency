import { useRef, useState, type FormEvent, type SyntheticEvent } from "react";
import type { Address } from "../../../shared/types";
import { LocationPicker, type Pin } from "../../components/map";
import { TextField } from "../../components/ui/field";
import { Button, Notice } from "../../components/ui/primitives";
import { api, ApiError, errorMessage } from "../../lib/api";

const empty = { label: "Home", line1: "", landmark: "", area: "", pincode: "", isDefault: false, lat: null, lng: null, accuracyM: null } as {
  label: string;
  line1: string;
  landmark: string;
  area: string;
  pincode: string;
  isDefault: boolean;
} & Pin;

export function AddressForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Address;
  onSaved: (a: Address) => void;
  onCancel?: () => void;
}) {
  const [v, setV] = useState(initial ? { ...initial } : empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Asked once: saving without a map pin first shows a reminder with "Save without it".
  const [askedForPin, setAskedForPin] = useState(false);
  const set = (k: "label" | "line1" | "landmark" | "area" | "pincode") => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const hasPin = v.lat !== null && v.lng !== null;

  async function submit(e: SyntheticEvent, skipPin = false) {
    e.preventDefault();
    if (!hasPin && !skipPin && !askedForPin) {
      setAskedForPin(true);
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const payload = {
        label: v.label,
        line1: v.line1,
        landmark: v.landmark,
        area: v.area,
        pincode: v.pincode,
        isDefault: v.isDefault,
        lat: v.lat,
        lng: v.lng,
        accuracyM: v.accuracyM,
      };
      const res = initial
        ? await api<{ address: Address }>(`/me/addresses/${initial.id}`, { method: "PUT", body: payload })
        : await api<{ address: Address }>("/me/addresses", { body: payload });
      onSaved(res.address);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        setErrors(err.fields);
        const first = Object.keys(err.fields)[0];
        // The event's element is gone after the await; use the form itself.
        formRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      } else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={(e: FormEvent<HTMLFormElement>) => void submit(e)} noValidate className="grid gap-4">
      <TextField
        name="line1"
        label="House, building and street"
        required
        autoComplete="street-address"
        value={v.line1}
        onChange={set("line1")}
        error={errors.line1}
        placeholder="Flat 4, Sai Residency, Gokul Road"
      />
      <TextField
        name="landmark"
        label="Landmark"
        value={v.landmark}
        onChange={set("landmark")}
        error={errors.landmark}
        hint="Helps the rider find you, like 'opposite Unkal Lake'."
      />
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <TextField name="area" label="Area" required autoComplete="address-level3" value={v.area} onChange={set("area")} error={errors.area} placeholder="Vidyanagar" />
        <TextField
          name="pincode"
          label="PIN code"
          required
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={v.pincode}
          onChange={(e) => setV((s) => ({ ...s, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
          error={errors.pincode}
          placeholder="580020"
        />
      </div>
      <LocationPicker
        value={{ lat: v.lat, lng: v.lng, accuracyM: v.accuracyM }}
        onChange={(p) => {
          setV((s) => ({ ...s, ...p }));
          setErrors((er) => ({ ...er, lat: "" }));
        }}
        error={errors.lat || undefined}
      />
      <TextField name="label" label="Save as" value={v.label} onChange={set("label")} error={errors.label} hint="Home, Work, Parents…" maxLength={30} />
      <label className="inline-flex min-h-11 items-center gap-3 text-small font-medium">
        <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={v.isDefault} onChange={(e) => setV((s) => ({ ...s, isDefault: e.target.checked }))} />
        Use this address by default
      </label>
      {formError && (
        <p role="alert" className="m-0 text-small font-medium text-danger">
          {formError}
        </p>
      )}
      {askedForPin && !hasPin && (
        <Notice tone="warn" title="Add your map location?" live>
          The rider finds you faster with a pin. Use <strong>Use my current location</strong> above, or save without it.
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" busy={busy}>
          Save address
        </Button>
        {askedForPin && !hasPin && (
          <Button variant="secondary" busy={busy} onClick={(e) => void submit(e, true)}>
            Save without map location
          </Button>
        )}
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export function addressLines(a: Pick<Address, "line1" | "landmark" | "area" | "pincode">) {
  return [a.line1, a.landmark && `Landmark: ${a.landmark}`, `${a.area}, Hubballi ${a.pincode}`].filter(Boolean).join(" · ");
}
