import { useState, type FormEvent } from "react";
import type { Address } from "../../../shared/types";
import { TextField } from "../../components/ui/field";
import { Button } from "../../components/ui/primitives";
import { api, ApiError, errorMessage } from "../../lib/api";

const empty = { label: "Home", line1: "", landmark: "", area: "", pincode: "", isDefault: false };

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
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const payload = { label: v.label, line1: v.line1, landmark: v.landmark, area: v.area, pincode: v.pincode, isDefault: v.isDefault };
      const res = initial
        ? await api<{ address: Address }>(`/me/addresses/${initial.id}`, { method: "PUT", body: payload })
        : await api<{ address: Address }>("/me/addresses", { body: payload });
      onSaved(res.address);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        setErrors(err.fields);
        const first = Object.keys(err.fields)[0];
        e.currentTarget.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      } else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" busy={busy}>
          Save address
        </Button>
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
