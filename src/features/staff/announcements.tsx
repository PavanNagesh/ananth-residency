import { useState, type FormEvent } from "react";
import { formatDateTime } from "../../../shared/time";
import type { AdminAnnouncement, AnnouncementKind } from "../../../shared/types";
import { SelectField, TextArea, TextField } from "../../components/ui/field";
import { Badge, Button, Dialog, ErrorBlock, IconButton, LoadingBlock, Switch } from "../../components/ui/primitives";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useResource } from "../../lib/use-resource";
import { StaffPageHeader } from "./app";

const KIND_LABEL: Record<AnnouncementKind, string> = { info: "Information", offer: "Offer", alert: "Important" };

/** datetime-local value (local time) ⇄ ISO string */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function liveState(a: AdminAnnouncement, now = Date.now()) {
  if (!a.isActive) return { tone: "neutral" as const, label: "Off" };
  if (a.startsAt && new Date(a.startsAt).getTime() > now) return { tone: "warn" as const, label: "Scheduled" };
  if (a.endsAt && new Date(a.endsAt).getTime() <= now) return { tone: "neutral" as const, label: "Ended" };
  return { tone: "ok" as const, label: "Showing" };
}

export function AnnouncementsPage() {
  const toast = useToast();
  const list = useResource<AdminAnnouncement[]>("announcements", (signal) =>
    api<{ announcements: AdminAnnouncement[] }>("/staff/announcements", { signal }).then((r) => r.announcements),
  );
  const [editing, setEditing] = useState<AdminAnnouncement | "new" | null>(null);

  async function toggle(a: AdminAnnouncement, isActive: boolean) {
    try {
      await api(`/staff/announcements/${a.id}`, { method: "PUT", body: { ...a, isActive } });
      await list.reload();
    } catch (e) {
      toast(errorMessage(e), "danger");
    }
  }

  async function remove(a: AdminAnnouncement) {
    if (!window.confirm("Delete this announcement?")) return;
    try {
      await api(`/staff/announcements/${a.id}`, { method: "DELETE" });
      await list.reload();
      toast("Announcement deleted.", "ok");
    } catch (e) {
      toast(errorMessage(e), "danger");
    }
  }

  return (
    <>
      <StaffPageHeader
        title="Announcements"
        description="Short notes shown at the top of the customer menu: offers, holidays, delays."
        actions={
          <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing("new")}>
            New announcement
          </Button>
        }
      />
      {list.loading && !list.data ? (
        <LoadingBlock />
      ) : list.error && !list.data ? (
        <ErrorBlock message={list.error} onRetry={() => void list.reload()} />
      ) : list.data?.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong px-4 py-10 text-center text-ink-2">No announcements yet.</p>
      ) : (
        <ul className="m-0 grid max-w-3xl list-none divide-y divide-line rounded-md border border-line bg-paper-raised p-0">
          {list.data?.map((a) => {
            const state = liveState(a);
            return (
              <li key={a.id} className="flex flex-wrap items-start gap-4 px-4 py-3">
                <Switch checked={a.isActive} onChange={(v) => void toggle(a, v)} label={`Show "${a.text}"`} hideLabel />
                <div className="grid min-w-48 flex-1 gap-1">
                  <p className="m-0">{a.text}</p>
                  <p className="m-0 flex flex-wrap items-center gap-2 text-small text-ink-2">
                    <Badge tone={state.tone}>{state.label}</Badge>
                    <span>{KIND_LABEL[a.kind]}</span>
                    {a.startsAt && <span>from {formatDateTime(a.startsAt)}</span>}
                    {a.endsAt && <span>until {formatDateTime(a.endsAt)}</span>}
                  </p>
                </div>
                <div className="flex">
                  <IconButton icon="edit" label="Edit announcement" onClick={() => setEditing(a)} />
                  <IconButton icon="trash" label="Delete announcement" onClick={() => void remove(a)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <AnnouncementEditor
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast("Announcement saved.", "ok");
            void list.reload();
          }}
        />
      )}
    </>
  );
}

function AnnouncementEditor({ item, onClose, onSaved }: { item: AdminAnnouncement | null; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(item?.text ?? "");
  const [kind, setKind] = useState<AnnouncementKind>(item?.kind ?? "info");
  const [startsAt, setStartsAt] = useState(toLocalInput(item?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(item?.endsAt ?? null));
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setErrors({});
    const body = { text: text.trim(), kind, isActive, startsAt: fromLocalInput(startsAt), endsAt: fromLocalInput(endsAt) };
    try {
      if (item) await api(`/staff/announcements/${item.id}`, { method: "PUT", body });
      else await api("/staff/announcements", { body });
      onSaved();
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
      title={item ? "Edit announcement" : "New announcement"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void save()}>
            Save announcement
          </Button>
        </div>
      }
    >
      <form onSubmit={save} noValidate className="grid gap-4">
        <TextArea
          label="Message"
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          error={errors.text}
          hint="Keep it to one or two sentences, like 'Closed on 14 November for Deepavali.'"
          maxLength={200}
          rows={3}
        />
        <SelectField label="Type" value={kind} onChange={(e) => setKind(e.target.value as AnnouncementKind)}>
          <option value="info">Information</option>
          <option value="offer">Offer</option>
          <option value="alert">Important</option>
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Show from" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} error={errors.startsAt} hint="Optional" />
          <TextField label="Show until" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={errors.endsAt} hint="Optional" />
        </div>
        <Switch checked={isActive} onChange={setIsActive} label="Show to customers" />
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
