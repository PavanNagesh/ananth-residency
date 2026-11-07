import { useEffect, useState, type FormEvent } from "react";
import { formatRupees } from "../../../shared/bill";
import { formatPhone } from "../../../shared/phone";
import type { Settings, StaffUser } from "../../../shared/types";
import { SelectField, TextArea, TextField } from "../../components/ui/field";
import { Badge, Button, Dialog, ErrorBlock, LoadingBlock, Notice, Switch } from "../../components/ui/primitives";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useResource } from "../../lib/use-resource";
import { StaffPageHeader, useStaff } from "./app";

type Draft = {
  restaurantName: string;
  restaurantPhone: string;
  restaurantAddress: string;
  pausedMessage: string;
  prepTimeMinutes: string;
  deliveryFee: string;
  freeThreshold: string;
  gstPercent: string;
  onlinePaymentEnabled: boolean;
};

const toDraft = (s: Settings): Draft => ({
  restaurantName: s.restaurantName,
  restaurantPhone: formatPhone(s.restaurantPhone),
  restaurantAddress: s.restaurantAddress,
  pausedMessage: s.pausedMessage,
  prepTimeMinutes: String(s.prepTimeMinutes),
  deliveryFee: String(s.deliveryFeePaise / 100),
  freeThreshold: String(s.freeDeliveryThresholdPaise / 100),
  gstPercent: String(s.gstBps / 100),
  onlinePaymentEnabled: s.onlinePaymentEnabled,
});

export function SettingsPage() {
  const { user, settings, setSettings } = useStaff();
  const toast = useToast();
  const owner = user.role === "owner";
  const [draft, setDraft] = useState<Draft | null>(settings ? toDraft(settings) : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings && !draft) setDraft(toDraft(settings));
  }, [settings, draft]);

  if (!settings || !draft) return <LoadingBlock />;
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => d && { ...d, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || !settings) return;
    setBusy(true);
    setErrors({});
    try {
      const r = await api<{ settings: Settings }>("/staff/settings", {
        method: "PUT",
        body: {
          restaurantName: draft.restaurantName,
          restaurantPhone: draft.restaurantPhone,
          restaurantAddress: draft.restaurantAddress,
          acceptingOrders: settings.acceptingOrders,
          pausedMessage: draft.pausedMessage,
          prepTimeMinutes: Number(draft.prepTimeMinutes),
          deliveryFeePaise: Math.round(Number(draft.deliveryFee) * 100),
          freeDeliveryThresholdPaise: Math.round(Number(draft.freeThreshold) * 100),
          gstBps: Math.round(Number(draft.gstPercent) * 100),
          onlinePaymentEnabled: draft.onlinePaymentEnabled,
        },
      });
      setSettings(r.settings);
      setDraft(toDraft(r.settings));
      toast("Settings saved. Customers see them within a minute.", "ok");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else toast(errorMessage(err), "danger");
    } finally {
      setBusy(false);
    }
  }

  const fee = Math.round(Number(draft.deliveryFee) * 100);
  const threshold = Math.round(Number(draft.freeThreshold) * 100);

  return (
    <>
      <StaffPageHeader title="Settings" description={owner ? undefined : "Only the owner can change these. You can pause orders from the switch at the top."} />
      <form onSubmit={save} noValidate className="grid max-w-2xl gap-10">
        <fieldset disabled={!owner} className="m-0 grid gap-4 border-0 p-0">
          <legend className="mb-4 font-display text-title font-semibold">Delivery and bill</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Delivery fee (₹)" type="number" inputMode="decimal" min={0} value={draft.deliveryFee} onChange={set("deliveryFee")} error={errors.deliveryFeePaise} />
            <TextField label="Free delivery from (₹)" type="number" inputMode="decimal" min={0} value={draft.freeThreshold} onChange={set("freeThreshold")} error={errors.freeDeliveryThresholdPaise} />
            <TextField label="GST (%)" type="number" inputMode="decimal" min={0} max={28} step="0.5" value={draft.gstPercent} onChange={set("gstPercent")} error={errors.gstBps} />
          </div>
          <p className="m-0 text-small text-ink-2">
            Orders below {Number.isFinite(threshold) ? formatRupees(threshold) : "the limit"} pay a {Number.isFinite(fee) ? formatRupees(fee) : ""} delivery fee. Orders of{" "}
            {Number.isFinite(threshold) ? formatRupees(threshold) : "the limit"} or more get free delivery.
          </p>
          <TextField label="Usual preparation time (minutes)" type="number" inputMode="numeric" min={5} max={180} value={draft.prepTimeMinutes} onChange={set("prepTimeMinutes")} error={errors.prepTimeMinutes} className="sm:max-w-60" />
        </fieldset>

        <fieldset disabled={!owner} className="m-0 grid gap-4 border-0 p-0">
          <legend className="mb-4 font-display text-title font-semibold">Restaurant details</legend>
          <TextField label="Name" value={draft.restaurantName} onChange={set("restaurantName")} error={errors.restaurantName} />
          <TextField label="Phone customers call" type="tel" value={draft.restaurantPhone} onChange={set("restaurantPhone")} error={errors.restaurantPhone} />
          <TextArea label="Address" value={draft.restaurantAddress} onChange={set("restaurantAddress")} error={errors.restaurantAddress} rows={2} />
          <TextArea
            label="Message when orders are paused"
            value={draft.pausedMessage}
            onChange={set("pausedMessage")}
            error={errors.pausedMessage}
            rows={2}
            maxLength={160}
          />
        </fieldset>

        <fieldset disabled={!owner} className="m-0 grid gap-3 border-0 p-0">
          <legend className="mb-4 font-display text-title font-semibold">Online payment</legend>
          {!settings.razorpayConfigured && (
            <Notice tone="info" title="Razorpay is not connected.">
              Add the Razorpay keys to the server settings (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) to offer online payment. Until then customers pay on delivery.
            </Notice>
          )}
          <Switch
            checked={draft.onlinePaymentEnabled}
            onChange={(v) => setDraft((d) => d && { ...d, onlinePaymentEnabled: v })}
            label="Offer online payment at checkout"
            description="Customers can still choose pay on delivery."
            disabled={!owner || !settings.razorpayConfigured}
          />
        </fieldset>

        {owner && (
          <div>
            <Button type="submit" variant="primary" busy={busy}>
              Save settings
            </Button>
          </div>
        )}
      </form>

      <ChangePassword />
    </>
  );
}

function ChangePassword() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api("/staff/me/password", { body: { current, next } });
      setCurrent("");
      setNext("");
      toast("Password changed. Other devices are signed out.", "ok");
    } catch (err) {
      setErrors(err instanceof ApiError && Object.keys(err.fields).length ? err.fields : { _: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="pw-h" className="mt-12 max-w-2xl border-t border-line pt-8">
      <h2 id="pw-h" className="m-0 mb-4 font-display text-title font-semibold">
        Change your password
      </h2>
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <TextField label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.current} />
        <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={errors.next} hint="At least 8 characters." />
        {errors._ && (
          <p role="alert" className="m-0 text-small font-medium text-danger sm:col-span-2">
            {errors._}
          </p>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" busy={busy}>
            Change password
          </Button>
        </div>
      </form>
    </section>
  );
}

// ---- Team (owner only) -------------------------------------------------------------

export function TeamPage() {
  const { user: me } = useStaff();
  const toast = useToast();
  const users = useResource<StaffUser[]>("staff-users", (signal) => api<{ users: StaffUser[] }>("/staff/users", { signal }).then((r) => r.users));
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<StaffUser | null>(null);

  async function update(u: StaffUser, body: Partial<{ isActive: boolean; role: string }>) {
    try {
      await api(`/staff/users/${u.id}`, { method: "PATCH", body });
      await users.reload();
      toast(`${u.name} updated.`, "ok");
    } catch (e) {
      toast(errorMessage(e), "danger");
    }
  }

  return (
    <>
      <StaffPageHeader
        title="Team"
        description="Add the people who take orders. They sign in with their phone number or name and the password you set."
        actions={
          <Button variant="primary" size="sm" icon="plus" onClick={() => setAdding(true)}>
            Add staff member
          </Button>
        }
      />
      {users.loading && !users.data ? (
        <LoadingBlock />
      ) : users.error && !users.data ? (
        <ErrorBlock message={users.error} onRetry={() => void users.reload()} />
      ) : (
        <ul className="m-0 grid max-w-3xl list-none divide-y divide-line rounded-md border border-line bg-paper-raised p-0">
          {users.data?.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <div className="grid min-w-48 flex-1 gap-0.5">
                <span className="flex items-center gap-2 font-semibold">
                  {u.name} {u.id === me.id && <Badge>You</Badge>} {!u.isActive && <Badge tone="warn">Switched off</Badge>}
                </span>
                <span className="num text-small text-ink-2">{formatPhone(u.phone)}</span>
              </div>
              <label className="sr-only" htmlFor={`role-${u.id}`}>
                Role for {u.name}
              </label>
              <select
                id={`role-${u.id}`}
                className="min-h-11 rounded-sm border border-line-strong bg-paper-raised px-3 text-small"
                value={u.role}
                disabled={u.id === me.id}
                onChange={(e) => void update(u, { role: e.target.value })}
              >
                <option value="staff">Staff</option>
                <option value="owner">Owner</option>
              </select>
              <Switch checked={u.isActive} onChange={(v) => void update(u, { isActive: v })} label="Can sign in" disabled={u.id === me.id} />
              <Button variant="ghost" size="sm" onClick={() => setResetting(u)}>
                Reset password
              </Button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <AddStaff
          onClose={() => setAdding(false)}
          onSaved={(name) => {
            setAdding(false);
            toast(`${name} can now sign in.`, "ok");
            void users.reload();
          }}
        />
      )}
      {resetting && (
        <ResetPassword
          user={resetting}
          onClose={() => setResetting(null)}
          onSaved={() => {
            toast(`New password set for ${resetting.name}. Their other sessions are signed out.`, "ok");
            setResetting(null);
          }}
        />
      )}
    </>
  );
}

function AddStaff({ onClose, onSaved }: { onClose: () => void; onSaved: (name: string) => void }) {
  const [v, setV] = useState({ name: "", phone: "", password: "", role: "staff" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api("/staff/users", { body: v });
      onSaved(v.name);
    } catch (err) {
      setErrors(err instanceof ApiError && Object.keys(err.fields).length ? err.fields : { _: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a staff member"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void save()}>
            Add staff member
          </Button>
        </div>
      }
    >
      <form onSubmit={save} noValidate className="grid gap-4">
        <TextField label="Name" value={v.name} onChange={set("name")} error={errors.name} autoComplete="off" />
        <TextField label="Phone number" type="tel" prefix="+91" value={v.phone} onChange={set("phone")} error={errors.phone} autoComplete="off" />
        <TextField label="Password" type="password" value={v.password} onChange={set("password")} error={errors.password} hint="At least 8 characters. Share it with them in person." autoComplete="new-password" />
        <SelectField label="Role" value={v.role} onChange={set("role")} hint="Owners can change settings, fees and the team.">
          <option value="staff">Staff</option>
          <option value="owner">Owner</option>
        </SelectField>
        {errors._ && (
          <p role="alert" className="m-0 text-small font-medium text-danger">
            {errors._}
          </p>
        )}
        <button type="submit" hidden aria-label="Save" />
      </form>
    </Dialog>
  );
}

function ResetPassword({ user, onClose, onSaved }: { user: StaffUser; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function save(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api(`/staff/users/${user.id}`, { method: "PATCH", body: { password } });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Reset password for ${user.name}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void save()}>
            Set password
          </Button>
        </div>
      }
    >
      <form onSubmit={save} noValidate>
        <TextField label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} hint="At least 8 characters." />
        <button type="submit" hidden aria-label="Save" />
      </form>
    </Dialog>
  );
}
