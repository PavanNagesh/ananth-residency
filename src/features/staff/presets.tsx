import { useMemo, useState } from "react";
import type { AdminMenu, Preset } from "../../../shared/types";
import { cn } from "../../components/ui/cn";
import { controlClasses, TextField } from "../../components/ui/field";
import { Icon, type IconName } from "../../components/ui/icons";
import { Button, Dialog, ErrorBlock, LoadingBlock } from "../../components/ui/primitives";
import { api, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useResource } from "../../lib/use-resource";
import { StaffPageHeader } from "./app";
import { useAdminMenu } from "./menu";

const presetIcon = (name: string): IconName => {
  const n = name.toLowerCase();
  if (n.includes("break")) return "coffee";
  if (n.includes("lunch")) return "sun";
  if (n.includes("dinner") || n.includes("night")) return "moon";
  return "layers";
};

export function PresetsPage() {
  const toast = useToast();
  const menu = useAdminMenu();
  const presets = useResource<Preset[]>("presets", (signal) => api<{ presets: Preset[] }>("/staff/presets", { signal }).then((r) => r.presets));
  const [applying, setApplying] = useState<Preset | null>(null);
  const [editing, setEditing] = useState<Preset | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const totalItems = menu.data?.items.length ?? 0;
  const onIds = useMemo(() => new Set(menu.data?.items.filter((i) => i.isAvailable).map((i) => i.id)), [menu.data]);
  const matches = (p: Preset) => {
    if (!menu.data) return false;
    const set = new Set(p.itemIds);
    return menu.data.items.every((i) => i.isAvailable === set.has(i.id));
  };

  async function apply(p: Preset) {
    setBusy(true);
    try {
      const r = await api<{ name: string; available: number; hidden: number }>(`/staff/presets/${p.id}/apply`, { body: {} });
      toast(`${r.name} menu is live: ${r.available} dishes on, ${r.hidden} off.`, "ok");
      setApplying(null);
      await menu.reload();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Preset) {
    if (!window.confirm(`Delete the preset ${p.name}? Dishes stay as they are.`)) return;
    try {
      await api(`/staff/presets/${p.id}`, { method: "DELETE" });
      toast(`${p.name} deleted.`, "ok");
      await presets.reload();
    } catch (e) {
      toast(errorMessage(e), "danger");
    }
  }

  return (
    <>
      <StaffPageHeader
        title="Presets"
        description="Switch the whole menu for the time of day in one tap. Applying a preset turns its dishes on and every other dish off. You can still switch single dishes afterwards on the Menu page."
        actions={
          <Button variant="secondary" size="sm" icon="plus" onClick={() => setEditing("new")}>
            New preset
          </Button>
        }
      />
      {(presets.loading && !presets.data) || (menu.loading && !menu.data) ? (
        <LoadingBlock label="Loading presets" />
      ) : presets.error && !presets.data ? (
        <ErrorBlock message={presets.error} onRetry={() => void presets.reload()} />
      ) : (
        <>
          <p className="num mt-0 mb-4 text-small text-ink-2" role="status">
            Right now {onIds.size} of {totalItems} dishes are on.
          </p>
          <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
            {presets.data?.map((p) => {
              const live = matches(p);
              return (
                <li key={p.id} className={cn("grid content-between gap-5 rounded-md border bg-paper-raised p-5", live ? "border-ok" : "border-line")}>
                  <div className="grid gap-1">
                    <div className="flex items-center gap-3">
                      <Icon name={presetIcon(p.name)} size={24} className="text-accent-text" />
                      <h2 className="m-0 font-display text-title font-semibold">{p.name}</h2>
                    </div>
                    <p className="num m-0 text-small text-ink-2">
                      {p.itemIds.length} of {totalItems} dishes
                    </p>
                    {live && (
                      <p className="m-0 inline-flex items-center gap-1.5 text-small font-semibold text-ok">
                        <Icon name="check" size={16} /> This is the live menu
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" onClick={() => setApplying(p)} disabled={live}>
                      Apply {p.name}
                    </Button>
                    <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditing(p)}>
                      Edit dishes
                    </Button>
                    <Button variant="ghost" size="sm" icon="trash" onClick={() => void remove(p)} aria-label={`Delete ${p.name}`}>
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Dialog
        open={applying !== null}
        onClose={() => setApplying(null)}
        title={applying ? `Apply ${applying.name}?` : "Apply preset"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setApplying(null)}>
              Not now
            </Button>
            <Button variant="primary" busy={busy} onClick={() => applying && void apply(applying)}>
              Apply {applying?.name}
            </Button>
          </div>
        }
      >
        {applying && (
          <p className="m-0">
            <span className="num font-semibold">{applying.itemIds.length}</span> dishes will be on and{" "}
            <span className="num font-semibold">{totalItems - applying.itemIds.length}</span> will be switched off. Customers see the change within a minute.
          </p>
        )}
      </Dialog>

      {editing && menu.data && (
        <PresetEditor
          preset={editing === "new" ? null : editing}
          menu={menu.data}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            toast(msg, "ok");
            void presets.reload();
          }}
        />
      )}
    </>
  );
}

function PresetEditor({ preset, menu, onClose, onSaved }: { preset: Preset | null; menu: AdminMenu; onClose: () => void; onSaved: (m: string) => void }) {
  const [name, setName] = useState(preset?.name ?? "");
  const [selected, setSelected] = useState<Set<number>>(() => new Set(preset?.itemIds ?? []));
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const q = query.trim().toLowerCase();

  const toggle = (ids: number[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  async function save() {
    if (!name.trim()) return setError("Name the preset, like Lunch.");
    setBusy(true);
    try {
      const body = { name: name.trim(), itemIds: [...selected] };
      if (preset) await api(`/staff/presets/${preset.id}`, { method: "PUT", body });
      else await api("/staff/presets", { body });
      onSaved(`${body.name} saved with ${selected.size} dishes.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={preset ? `Edit ${preset.name}` : "New preset"}
      description={<span className="num">{selected.size} dishes selected</span>}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void save()}>
            Save preset
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <TextField label="Preset name" value={name} onChange={(e) => setName(e.target.value)} error={error} maxLength={40} />
        <div className="relative">
          <label htmlFor="preset-filter" className="sr-only">
            Find a dish
          </label>
          <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
          <input id="preset-filter" type="search" className={cn(controlClasses, "pl-10")} placeholder="Find a dish" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {menu.categories.map((c) => {
          const items = menu.items.filter((i) => i.categoryId === c.id && (!q || i.name.toLowerCase().includes(q)));
          if (!items.length) return null;
          const ids = items.map((i) => i.id);
          const all = ids.every((id) => selected.has(id));
          return (
            <fieldset key={c.id} className="m-0 grid gap-1 border-0 p-0">
              <legend className="mb-1 flex w-full items-center justify-between gap-3">
                <span className="font-semibold">{c.name}</span>
                <button type="button" className="min-h-9 text-small font-semibold text-accent-text underline" onClick={() => toggle(ids, !all)}>
                  {all ? "Clear all" : "Select all"}
                </button>
              </legend>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {items.map((i) => (
                  <label key={i.id} className="flex min-h-10 cursor-pointer items-center gap-3 text-small">
                    <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={selected.has(i.id)} onChange={(e) => toggle([i.id], e.target.checked)} />
                    {i.name}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    </Dialog>
  );
}
