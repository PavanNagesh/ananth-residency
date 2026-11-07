import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { formatPhone } from "../../../shared/phone";
import type { Address, Customer } from "../../../shared/types";
import { TextField } from "../../components/ui/field";
import { Badge, Button, ErrorBlock, IconButton, LoadingBlock } from "../../components/ui/primitives";
import { api, errorMessage } from "../../lib/api";
import { useCustomer } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { useResource } from "../../lib/use-resource";
import { AddressForm, addressLines } from "./address-form";
import { PagePanel } from "./layout";

export function AccountPage() {
  const { customer, setCustomer, signOut } = useCustomer();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(customer?.name ?? "");
  const [nameError, setNameError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const addrs = useResource<Address[]>("my-addresses", (signal) =>
    api<{ addresses: Address[] }>("/me/addresses", { signal }).then((r) => r.addresses),
  );

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNameError(undefined);
    try {
      const r = await api<{ customer: Customer }>("/me", { method: "PUT", body: { name } });
      setCustomer(r.customer);
      toast("Name saved.", "ok");
    } catch (err) {
      setNameError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(a: Address) {
    if (!window.confirm(`Remove the address "${a.label}"?`)) return;
    try {
      await api(`/me/addresses/${a.id}`, { method: "DELETE" });
      await addrs.reload();
      toast("Address removed.", "ok");
    } catch (err) {
      toast(errorMessage(err), "danger");
    }
  }

  if (!customer) return null;

  return (
    <PagePanel title="Account" back={{ to: "/", label: "Back to menu" }}>
      <div className="grid gap-10">
        <section aria-labelledby="profile-h" className="grid gap-4">
          <h2 id="profile-h" className="m-0 font-display text-title font-semibold">
            Your details
          </h2>
          <p className="m-0 text-ink-2">
            Signed in as <span className="num font-semibold text-ink">{formatPhone(customer.phone)}</span>
          </p>
          <form onSubmit={saveName} noValidate className="flex flex-wrap items-end gap-3">
            <TextField label="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={nameError} className="min-w-60 flex-1" />
            <Button type="submit" variant="secondary" busy={saving}>
              Save name
            </Button>
          </form>
        </section>

        <section aria-labelledby="addr-h" className="grid gap-4">
          <h2 id="addr-h" className="m-0 font-display text-title font-semibold">
            Saved addresses
          </h2>
          {addrs.loading && !addrs.data ? (
            <LoadingBlock />
          ) : addrs.error && !addrs.data ? (
            <ErrorBlock message={addrs.error} onRetry={() => void addrs.reload()} />
          ) : (
            <ul className="m-0 grid list-none divide-y divide-line p-0">
              {addrs.data?.length === 0 && <li className="py-2 text-ink-2">No saved addresses yet.</li>}
              {addrs.data?.map((a) =>
                editing !== "new" && editing?.id === a.id ? (
                  <li key={a.id} className="py-4">
                    <AddressForm
                      initial={a}
                      onSaved={() => {
                        setEditing(null);
                        void addrs.reload();
                        toast("Address saved.", "ok");
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  </li>
                ) : (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="grid gap-0.5">
                      <span className="flex items-center gap-2 font-semibold">
                        {a.label} {a.isDefault && <Badge>Default</Badge>}
                      </span>
                      <span className="text-small text-ink-2">{addressLines(a)}</span>
                    </div>
                    <div className="flex">
                      <IconButton icon="edit" label={`Edit ${a.label}`} onClick={() => setEditing(a)} />
                      <IconButton icon="trash" label={`Remove ${a.label}`} onClick={() => void remove(a)} />
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
          {editing === "new" ? (
            <div className="rounded-md border border-line p-4">
              <AddressForm
                onSaved={() => {
                  setEditing(null);
                  void addrs.reload();
                  toast("Address saved.", "ok");
                }}
                onCancel={() => setEditing(null)}
              />
            </div>
          ) : (
            <Button variant="secondary" size="sm" icon="plus" className="justify-self-start" onClick={() => setEditing("new")}>
              Add an address
            </Button>
          )}
        </section>

        <Button
          variant="ghost"
          icon="logout"
          className="justify-self-start"
          onClick={async () => {
            await signOut();
            navigate("/", { replace: true });
          }}
        >
          Sign out
        </Button>
      </div>
    </PagePanel>
  );
}
