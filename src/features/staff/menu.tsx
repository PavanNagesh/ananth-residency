import { useMemo, useState, type FormEvent } from "react";
import { formatRupees } from "../../../shared/bill";
import type { AdminCategory, AdminItem, AdminMenu } from "../../../shared/types";
import { cn } from "../../components/ui/cn";
import { controlClasses, SelectField, TextArea, TextField } from "../../components/ui/field";
import { Icon } from "../../components/ui/icons";
import { Badge, Button, Dialog, ErrorBlock, IconButton, LoadingBlock, Switch } from "../../components/ui/primitives";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useResource } from "../../lib/use-resource";
import { StaffPageHeader } from "./app";

export const useAdminMenu = () =>
  useResource<AdminMenu>("admin-menu", (signal) => api<AdminMenu>("/staff/menu", { signal }), { pollMs: 30_000 });

const toRupees = (paise: number) => String(paise / 100);
const toPaise = (rupees: string) => Math.round(Number(rupees) * 100);

export function MenuManager() {
  const menu = useAdminMenu();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [onlyOff, setOnlyOff] = useState(false);
  const [editing, setEditing] = useState<AdminItem | { categoryId: number } | null>(null);
  const [editingCat, setEditingCat] = useState<AdminCategory | "new" | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const data = menu.data;
  const q = query.trim().toLowerCase();
  const grouped = useMemo(() => {
    if (!data) return [];
    return data.categories.map((c) => ({
      category: c,
      all: data.items.filter((i) => i.categoryId === c.id),
      items: data.items.filter((i) => i.categoryId === c.id && (!q || i.name.toLowerCase().includes(q)) && (!onlyOff || !i.isAvailable)),
    }));
  }, [data, q, onlyOff]);

  const totalOn = data?.items.filter((i) => i.isAvailable).length ?? 0;

  async function withPending(key: string, fn: () => Promise<void>) {
    setPending((s) => new Set(s).add(key));
    try {
      await fn();
    } catch (e) {
      toast(errorMessage(e), "danger");
      void menu.reload();
    } finally {
      setPending((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }

  const setItem = (item: AdminItem, isAvailable: boolean) =>
    withPending(`i${item.id}`, async () => {
      menu.setData((d) => d && { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, isAvailable } : i)) });
      await api(`/staff/items/${item.id}/availability`, { method: "PATCH", body: { isAvailable } });
      toast(`${item.name} ${isAvailable ? "is on the menu" : "is hidden from customers"}.`, "ok");
    });

  const setVariant = (item: AdminItem, variantId: number, isAvailable: boolean) =>
    withPending(`v${variantId}`, async () => {
      menu.setData(
        (d) =>
          d && {
            ...d,
            items: d.items.map((i) => (i.id === item.id ? { ...i, variants: i.variants.map((v) => (v.id === variantId ? { ...v, isAvailable } : v)) } : i)),
          },
      );
      await api(`/staff/variants/${variantId}/availability`, { method: "PATCH", body: { isAvailable } });
    });

  const setCategoryItems = (c: AdminCategory, isAvailable: boolean) =>
    withPending(`c${c.id}`, async () => {
      menu.setData((d) => d && { ...d, items: d.items.map((i) => (i.categoryId === c.id ? { ...i, isAvailable } : i)) });
      await api("/staff/items/availability", { body: { categoryId: c.id, isAvailable } });
      toast(`Every dish in ${c.name} is now ${isAvailable ? "on" : "off"}.`, "ok");
    });

  const setCategoryActive = (c: AdminCategory, isActive: boolean) =>
    withPending(`ca${c.id}`, async () => {
      menu.setData((d) => d && { ...d, categories: d.categories.map((x) => (x.id === c.id ? { ...x, isActive } : x)) });
      await api(`/staff/categories/${c.id}`, { method: "PUT", body: { name: c.name, note: c.note, sort: c.sort, isActive } });
      toast(`${c.name} is ${isActive ? "shown" : "hidden"}.`, "ok");
    });

  return (
    <>
      <StaffPageHeader
        title="Menu"
        description="Switch a dish off when the kitchen cannot make it. It disappears from the customer menu within a minute."
        actions={
          <>
            <Button variant="secondary" size="sm" icon="plus" onClick={() => setEditingCat("new")}>
              Add category
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="plus"
              disabled={!data?.categories.length}
              onClick={() => setEditing({ categoryId: data!.categories[0]!.id })}
            >
              Add dish
            </Button>
          </>
        }
      />

      {menu.loading && !data ? (
        <LoadingBlock label="Loading the menu" />
      ) : menu.error && !data ? (
        <ErrorBlock message={menu.error} onRetry={() => void menu.reload()} />
      ) : data ? (
        <>
          <div className="sticky top-0 z-10 -mx-1 mb-4 flex flex-wrap items-center gap-3 bg-paper px-1 py-2">
            <div className="relative min-w-60 flex-1">
              <label htmlFor="menu-filter" className="sr-only">
                Find a dish
              </label>
              <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
              <input
                id="menu-filter"
                type="search"
                className={cn(controlClasses, "pl-10")}
                placeholder="Find a dish"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <label className="inline-flex min-h-11 items-center gap-2 text-small font-medium">
              <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={onlyOff} onChange={(e) => setOnlyOff(e.target.checked)} />
              Show only dishes that are off
            </label>
            <p className="num m-0 text-small text-ink-2" role="status">
              {totalOn} of {data.items.length} dishes on
            </p>
          </div>

          <div className="grid gap-4">
            {grouped.map(({ category: c, items, all }) =>
              (q || onlyOff) && items.length === 0 ? null : (
                <details key={c.id} open={Boolean(q) || onlyOff || undefined} className="group rounded-md border border-line bg-paper-raised">
                  <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-2">
                      <Icon name="chevronRight" size={18} className="text-ink-3 transition-transform duration-(--dur-quick) group-open:rotate-90" />
                      <span className="font-display text-title font-semibold">{c.name}</span>
                      <span className="num text-small text-ink-2">
                        {all.filter((i) => i.isAvailable).length}/{all.length} on
                      </span>
                      {!c.isActive && <Badge tone="warn">Hidden</Badge>}
                    </span>
                  </summary>
                  <div className="border-t border-line">
                    <div className="flex flex-wrap items-center gap-2 bg-paper-sunken px-4 py-2.5">
                      <Button variant="secondary" size="sm" busy={pending.has(`c${c.id}`)} onClick={() => void setCategoryItems(c, true)}>
                        Turn all on
                      </Button>
                      <Button variant="secondary" size="sm" busy={pending.has(`c${c.id}`)} onClick={() => void setCategoryItems(c, false)}>
                        Turn all off
                      </Button>
                      <Button variant="ghost" size="sm" icon="plus" onClick={() => setEditing({ categoryId: c.id })}>
                        Add dish here
                      </Button>
                      <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditingCat(c)}>
                        Edit category
                      </Button>
                      <Switch
                        className="ml-auto"
                        checked={c.isActive}
                        busy={pending.has(`ca${c.id}`)}
                        onChange={(v) => void setCategoryActive(c, v)}
                        label="Show category"
                      />
                    </div>
                    <ul className="m-0 list-none divide-y divide-line p-0">
                      {items.map((item) => (
                        <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                          <Switch
                            checked={item.isAvailable}
                            onChange={(v) => void setItem(item, v)}
                            label={`${item.name} available`}
                            hideLabel
                            busy={pending.has(`i${item.id}`)}
                          />
                          <div className="min-w-40 flex-1">
                            <p className={cn("m-0 font-semibold", !item.isAvailable && "text-ink-3 line-through decoration-1")}>{item.name}</p>
                            <p className="num m-0 text-small text-ink-2">
                              {item.variants.length ? item.variants.map((v) => `${v.name} ${formatRupees(v.pricePaise)}`).join(" · ") : formatRupees(item.pricePaise)}
                            </p>
                          </div>
                          {item.variants.length > 0 && (
                            <div className="flex flex-wrap gap-3">
                              {item.variants.map((v) => (
                                <Switch
                                  key={v.id}
                                  checked={v.isAvailable}
                                  onChange={(on) => void setVariant(item, v.id, on)}
                                  label={v.name}
                                  busy={pending.has(`v${v.id}`)}
                                  disabled={!item.isAvailable}
                                />
                              ))}
                            </div>
                          )}
                          <IconButton icon="edit" label={`Edit ${item.name}`} onClick={() => setEditing(item)} />
                        </li>
                      ))}
                      {items.length === 0 && <li className="px-4 py-4 text-small text-ink-2">No dishes in this category yet.</li>}
                    </ul>
                  </div>
                </details>
              ),
            )}
          </div>
        </>
      ) : null}

      {data && editing && (
        <ItemEditor
          key={"id" in editing ? editing.id : `new-${editing.categoryId}`}
          item={"id" in editing ? editing : null}
          categoryId={editing.categoryId}
          categories={data.categories}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            toast(msg, "ok");
            void menu.reload();
          }}
        />
      )}
      {editingCat && (
        <CategoryEditor
          category={editingCat === "new" ? null : editingCat}
          itemCount={editingCat === "new" ? 0 : (data?.items.filter((i) => i.categoryId === editingCat.id).length ?? 0)}
          onClose={() => setEditingCat(null)}
          onSaved={(msg) => {
            setEditingCat(null);
            toast(msg, "ok");
            void menu.reload();
          }}
        />
      )}
    </>
  );
}

type VariantDraft = { id?: number; name: string; price: string; isAvailable: boolean };

function ItemEditor({
  item,
  categoryId,
  categories,
  onClose,
  onSaved,
}: {
  item: AdminItem | null;
  categoryId: number;
  categories: AdminCategory[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [cat, setCat] = useState(String(item?.categoryId ?? categoryId));
  const [price, setPrice] = useState(item ? toRupees(item.pricePaise) : "");
  const [available, setAvailable] = useState(item?.isAvailable ?? true);
  const [variants, setVariants] = useState<VariantDraft[]>(
    item?.variants.map((v) => ({ id: v.id, name: v.name, price: toRupees(v.pricePaise), isAvailable: v.isAvailable })) ?? [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Enter the dish name.";
    if (!variants.length && !(Number(price) > 0)) errs.pricePaise = "Enter a price in rupees, like 240.";
    variants.forEach((v, i) => {
      if (!v.name.trim()) errs[`variants.${i}.name`] = "Name this option.";
      if (!(Number(v.price) > 0)) errs[`variants.${i}.pricePaise`] = "Enter a price.";
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy("save");
    setFormError(null);
    const body = {
      categoryId: Number(cat),
      name: name.trim(),
      description: description.trim(),
      pricePaise: variants.length ? toPaise(variants[0]!.price) : toPaise(price),
      isAvailable: available,
      sort: item?.sort ?? 0,
      variants: variants.map((v) => ({ id: v.id, name: v.name.trim(), pricePaise: toPaise(v.price), isAvailable: v.isAvailable })),
    };
    try {
      if (item) await api(`/staff/items/${item.id}`, { method: "PUT", body });
      else await api("/staff/items", { body });
      onSaved(item ? `${body.name} saved.` : `${body.name} added to the menu.`);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      setFormError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!item || !window.confirm(`Delete ${item.name}? Past orders keep their record. To hide it for a while, switch it off instead.`)) return;
    setBusy("delete");
    try {
      await api(`/staff/items/${item.id}`, { method: "DELETE" });
      onSaved(`${item.name} deleted.`);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={item ? `Edit ${item.name}` : "Add a dish"}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {item ? (
            <Button variant="danger" size="sm" icon="trash" busy={busy === "delete"} onClick={() => void remove()}>
              Delete dish
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" busy={busy === "save"} onClick={() => void save()}>
              {item ? "Save dish" : "Add dish"}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={save} noValidate className="grid gap-4">
        <TextField label="Dish name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={80} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Category" value={cat} onChange={(e) => setCat(e.target.value)} error={errors.categoryId}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          {variants.length === 0 && (
            <TextField
              label="Price (₹)"
              required
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              error={errors.pricePaise}
            />
          )}
        </div>
        <TextArea label="Description" hint="Optional. One short line customers see under the name." value={description} onChange={(e) => setDescription(e.target.value)} maxLength={240} rows={2} />
        <Switch checked={available} onChange={setAvailable} label="Available now" description="Off hides it from customers." />

        <fieldset className="m-0 grid gap-3 rounded-md border border-line p-4">
          <legend className="px-1 text-small font-semibold">Options</legend>
          <p className="m-0 text-small text-ink-2">
            Add options when one dish comes in versions with their own price, like single and double scoop, or with butter. Customers must pick one.
          </p>
          {variants.map((v, i) => (
            <div key={i} className="grid items-start gap-3 sm:grid-cols-[1fr_8rem_auto_auto]">
              <TextField
                label={`Option ${i + 1} name`}
                value={v.name}
                onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                error={errors[`variants.${i}.name`]}
                maxLength={40}
              />
              <TextField
                label="Price (₹)"
                type="number"
                inputMode="decimal"
                min={0}
                value={v.price}
                onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                error={errors[`variants.${i}.pricePaise`]}
              />
              <Switch
                className="sm:mt-8"
                checked={v.isAvailable}
                onChange={(on) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, isAvailable: on } : x)))}
                label="On"
              />
              <IconButton
                className="sm:mt-6"
                icon="trash"
                label={`Remove option ${v.name || i + 1}`}
                onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}
              />
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            className="justify-self-start"
            onClick={() => setVariants((vs) => [...vs, { name: "", price: vs.length ? "" : price, isAvailable: true }])}
          >
            Add option
          </Button>
        </fieldset>
        {formError && (
          <p role="alert" className="m-0 text-small font-medium text-danger">
            {formError}
          </p>
        )}
        <button type="submit" hidden aria-label="Save" />
      </form>
    </Dialog>
  );
}

function CategoryEditor({
  category,
  itemCount,
  onClose,
  onSaved,
}: {
  category: AdminCategory | null;
  itemCount: number;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [note, setNote] = useState(category?.note ?? "");
  const [sort, setSort] = useState(String(category?.sort ?? ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!name.trim()) return setErrors({ name: "Enter a category name." });
    setBusy("save");
    setFormError(null);
    const body = { name: name.trim(), note: note.trim(), sort: Number(sort) || 0, isActive: category?.isActive ?? true };
    try {
      if (category) await api(`/staff/categories/${category.id}`, { method: "PUT", body });
      else await api("/staff/categories", { body });
      onSaved(`${body.name} saved.`);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      setFormError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!category || !window.confirm(`Delete the category ${category.name}?`)) return;
    setBusy("delete");
    try {
      await api(`/staff/categories/${category.id}`, { method: "DELETE" });
      onSaved(`${category.name} deleted.`);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={category ? `Edit ${category.name}` : "Add a category"}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {category ? (
            <Button variant="danger" size="sm" icon="trash" busy={busy === "delete"} disabled={itemCount > 0} onClick={() => void remove()} title={itemCount > 0 ? "Move or delete its dishes first" : undefined}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" busy={busy === "save"} onClick={() => void save()}>
              Save category
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={save} noValidate className="grid gap-4">
        <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={60} />
        <TextField label="Note for customers" hint="Optional, like 'Served 11:30 am to 3:30 pm.'" value={note} onChange={(e) => setNote(e.target.value)} maxLength={160} />
        <TextField label="Position" type="number" inputMode="numeric" hint="Lower numbers appear first on the menu." value={sort} onChange={(e) => setSort(e.target.value)} />
        {category && itemCount > 0 && <p className="m-0 text-small text-ink-2">This category has {itemCount} dishes. Move or delete them before deleting the category.</p>}
        {formError && (
          <p role="alert" className="m-0 text-small font-medium text-danger">
            {formError}
          </p>
        )}
        <button type="submit" hidden aria-label="Save" />
      </form>
    </Dialog>
  );
}
