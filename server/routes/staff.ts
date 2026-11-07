import bcrypt from "bcryptjs";
import { and, asc, count, desc, eq, gte, inArray, notInArray, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  acceptingSchema,
  announcementSchema,
  availabilitySchema,
  bulkAvailabilitySchema,
  categorySchema,
  changePasswordSchema,
  itemSchema,
  presetSchema,
  settingsSchema,
  staffCreateSchema,
  staffLoginSchema,
  staffOrderActionSchema,
  staffUpdateSchema,
} from "../../shared/schemas.js";
import { normalizeIndianPhone } from "../../shared/phone.js";
import { istDate } from "../../shared/time.js";
import type { AdminAnnouncement, AdminMenu, Preset, StaffOrdersResponse, StaffUser } from "../../shared/types.js";
import { ACTIVE_STATUSES } from "../../shared/types.js";
import { requireOwner, requireStaff } from "../auth/middleware.js";
import { clearSession, issueSession } from "../auth/session.js";
import { getDb } from "../db/index.js";
import {
  announcements,
  categories,
  itemVariants,
  menuItems,
  orderEvents,
  orders,
  presetItems,
  presets,
  settings,
  staff,
} from "../db/schema.js";
import { body, HttpError, idParam, notFound, type AppEnv } from "../http.js";
import { loadSettings, ordersWithEvents, settingsDto, STAFF_TRANSITIONS } from "../services.js";

export const staffRoutes = new Hono<AppEnv>();

// ---- Login (simple per-instance throttle on top of bcrypt) ---------------------

const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 10 * 60_000;
// Compared against when the account does not exist, so response time does not reveal it.
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("not-a-real-password", 10));

staffRoutes.post("/login", async (c) => {
  const { identifier, password } = await body(c, staffLoginSchema);
  const key = identifier.toLowerCase();
  const f = failures.get(key);
  if (f && f.count >= MAX_FAILURES && f.until > Date.now()) {
    throw new HttpError(429, "Too many wrong passwords. Wait 10 minutes, or ask the owner to reset your password.");
  }

  const db = getDb();
  const phone = normalizeIndianPhone(identifier);
  const rows = phone
    ? await db.select().from(staff).where(eq(staff.phone, phone))
    : await db.select().from(staff).where(sql`lower(${staff.name}) = ${key}`);
  if (rows.length > 1) throw new HttpError(409, "More than one person has that name. Sign in with your phone number instead.");
  const user = rows[0];
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(password, getDummyHash());
  if (!user || !ok || !user.isActive) {
    failures.set(key, { count: (f && f.until > Date.now() ? f.count : 0) + 1, until: Date.now() + LOCK_MS });
    throw new HttpError(401, user && ok && !user.isActive
      ? "This account is switched off. Ask the owner to turn it back on."
      : "That phone number or password is not right. Check both and try again.");
  }
  failures.delete(key);
  await issueSession(c, "staff", { sub: String(user.id), v: user.sessionVersion });
  return c.json({ staff: { id: user.id, name: user.name, phone: user.phone, role: user.role, isActive: true } satisfies StaffUser });
});

staffRoutes.post("/logout", (c) => {
  clearSession(c, "staff");
  return c.json({ ok: true });
});

// Everything below requires a signed-in staff member.
const authed = new Hono<AppEnv>();
authed.use(requireStaff);

authed.get("/me", (c) => c.json({ staff: { ...c.get("staff"), isActive: true } satisfies StaffUser }));

authed.post("/me/password", async (c) => {
  const { current, next } = await body(c, changePasswordSchema);
  const db = getDb();
  const me = c.get("staff");
  const [row] = await db.select().from(staff).where(eq(staff.id, me.id));
  if (!row || !(await bcrypt.compare(current, row.passwordHash))) {
    throw new HttpError(422, "Your current password is not right.", { current: "Check your current password." });
  }
  const [updated] = await db
    .update(staff)
    .set({ passwordHash: await bcrypt.hash(next, 10), sessionVersion: row.sessionVersion + 1 })
    .where(eq(staff.id, me.id))
    .returning();
  await issueSession(c, "staff", { sub: String(me.id), v: updated!.sessionVersion });
  return c.json({ ok: true });
});

// ---- Orders --------------------------------------------------------------------

authed.get("/orders", async (c) => {
  const db = getDb();
  const today = istDate();
  const since = new Date(Date.now() - 36 * 3_600_000);
  const rows = await db
    .select()
    .from(orders)
    .where(
      or(
        inArray(orders.status, ACTIVE_STATUSES),
        and(eq(orders.orderDate, today), notInArray(orders.status, ["pending_payment"])),
        and(eq(orders.status, "pending_payment"), gte(orders.createdAt, since)),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(300);
  const list = await ordersWithEvents(db, rows);
  const todays = rows.filter((r) => r.orderDate === today && r.status !== "cancelled" && r.status !== "pending_payment");
  const res: StaffOrdersResponse = {
    orders: list,
    summary: {
      ordersToday: todays.length,
      revenueTodayPaise: todays.reduce((s, r) => s + r.totalPaise, 0),
      unacknowledged: rows.filter((r) => r.status === "new" && r.acknowledgedAt === null).length,
    },
    serverTime: new Date().toISOString(),
  };
  return c.json(res);
});

authed.get("/orders/history", async (c) => {
  const db = getDb();
  const date = c.req.query("date") ?? istDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(422, "Pick a valid date.");
  const rows = await db.select().from(orders).where(eq(orders.orderDate, date)).orderBy(desc(orders.createdAt));
  return c.json({ orders: await ordersWithEvents(db, rows) });
});

authed.patch("/orders/:id", async (c) => {
  const id = idParam(c);
  const { action, reason } = await body(c, staffOrderActionSchema);
  const db = getDb();
  const me = c.get("staff");
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  if (!row) throw notFound("That order");

  if (action === "ack") {
    const [updated] = await db.update(orders).set({ acknowledgedAt: row.acknowledgedAt ?? new Date() }).where(eq(orders.id, id)).returning();
    const [o] = await ordersWithEvents(db, [updated!]);
    return c.json({ order: o! });
  }

  const t = STAFF_TRANSITIONS[action]!;
  if (action === "cancel" && !reason) throw new HttpError(422, "Add a reason so the customer knows why.", { reason: "Enter a reason." });
  const [updated] = await db
    .update(orders)
    .set({
      status: t.to,
      acknowledgedAt: row.acknowledgedAt ?? new Date(),
      ...(action === "cancel" ? { cancelReason: reason } : {}),
      ...(action === "delivered" && row.paymentMethod === "cod" ? { paymentStatus: "paid" as const } : {}),
    })
    .where(and(eq(orders.id, id), inArray(orders.status, t.from)))
    .returning();
  if (!updated) throw new HttpError(409, "This order changed on another screen. The list has been refreshed.");
  await db.insert(orderEvents).values({ orderId: id, status: t.to, staffId: me.id, note: action === "cancel" ? reason : null });
  const [o] = await ordersWithEvents(db, [updated]);
  return c.json({ order: o! });
});

// ---- Menu ----------------------------------------------------------------------

authed.get("/menu", async (c) => {
  const db = getDb();
  const [cats, items, variants] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.sort), asc(categories.id)),
    db.select().from(menuItems).orderBy(asc(menuItems.sort), asc(menuItems.id)),
    db.select().from(itemVariants).orderBy(asc(itemVariants.sort), asc(itemVariants.id)),
  ]);
  const byItem = Map.groupBy(variants, (v) => v.itemId);
  const res: AdminMenu = {
    categories: cats.map((c) => ({ id: c.id, name: c.name, note: c.note, sort: c.sort, isActive: c.isActive })),
    items: items.map((i) => ({
      id: i.id,
      categoryId: i.categoryId,
      name: i.name,
      description: i.description,
      pricePaise: i.pricePaise,
      isAvailable: i.isAvailable,
      sort: i.sort,
      variants: (byItem.get(i.id) ?? []).map((v) => ({
        id: v.id,
        name: v.name,
        pricePaise: v.pricePaise,
        isAvailable: v.isAvailable,
        sort: v.sort,
      })),
    })),
  };
  return c.json(res);
});

authed.post("/categories", async (c) => {
  const input = await body(c, categorySchema);
  const db = getDb();
  const sort = input.sort || ((await db.select({ m: sql<number>`coalesce(max(${categories.sort}), 0)` }).from(categories))[0]?.m ?? 0) + 10;
  const [row] = await db.insert(categories).values({ ...input, sort }).returning();
  return c.json({ category: row }, 201);
});

authed.put("/categories/:id", async (c) => {
  const id = idParam(c);
  const input = await body(c, categorySchema);
  const [row] = await getDb().update(categories).set(input).where(eq(categories.id, id)).returning();
  if (!row) throw notFound("That category");
  return c.json({ category: row });
});

authed.delete("/categories/:id", async (c) => {
  const id = idParam(c);
  const db = getDb();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(menuItems).where(eq(menuItems.categoryId, id));
  if (n > 0) throw new HttpError(409, `This category still has ${n} dish${n === 1 ? "" : "es"}. Move or delete them first.`);
  const [row] = await db.delete(categories).where(eq(categories.id, id)).returning();
  if (!row) throw notFound("That category");
  return c.json({ ok: true });
});

async function saveItem(itemId: number | null, input: Awaited<ReturnType<typeof itemSchema.parse>>) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [cat] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, input.categoryId));
    if (!cat) throw new HttpError(422, "Choose a category for this dish.", { categoryId: "Choose a category." });
    const { variants, ...fields } = input;
    const basePrice = variants.length ? Math.min(...variants.map((v) => v.pricePaise)) : fields.pricePaise;
    let id = itemId;
    if (id === null) {
      const sort =
        fields.sort ||
        ((await tx.select({ m: sql<number>`coalesce(max(${menuItems.sort}), 0)` }).from(menuItems).where(eq(menuItems.categoryId, fields.categoryId)))[0]?.m ?? 0) + 10;
      const [row] = await tx.insert(menuItems).values({ ...fields, pricePaise: basePrice, sort }).returning({ id: menuItems.id });
      id = row!.id;
    } else {
      const [row] = await tx.update(menuItems).set({ ...fields, pricePaise: basePrice }).where(eq(menuItems.id, id)).returning({ id: menuItems.id });
      if (!row) throw notFound("That dish");
    }
    // Replace options: keep ids that were sent, delete the rest.
    const keepIds = variants.flatMap((v) => (v.id ? [v.id] : []));
    await tx
      .delete(itemVariants)
      .where(and(eq(itemVariants.itemId, id), keepIds.length ? notInArray(itemVariants.id, keepIds) : sql`true`));
    for (const [i, v] of variants.entries()) {
      if (v.id) {
        await tx
          .update(itemVariants)
          .set({ name: v.name, pricePaise: v.pricePaise, isAvailable: v.isAvailable, sort: i })
          .where(and(eq(itemVariants.id, v.id), eq(itemVariants.itemId, id)));
      } else {
        await tx.insert(itemVariants).values({ itemId: id, name: v.name, pricePaise: v.pricePaise, isAvailable: v.isAvailable, sort: i });
      }
    }
    return id;
  });
}

authed.post("/items", async (c) => {
  const id = await saveItem(null, await body(c, itemSchema));
  return c.json({ id }, 201);
});

authed.put("/items/:id", async (c) => {
  const id = await saveItem(idParam(c), await body(c, itemSchema));
  return c.json({ id });
});

authed.delete("/items/:id", async (c) => {
  const [row] = await getDb().delete(menuItems).where(eq(menuItems.id, idParam(c))).returning();
  if (!row) throw notFound("That dish");
  return c.json({ ok: true });
});

authed.patch("/items/:id/availability", async (c) => {
  const { isAvailable } = await body(c, availabilitySchema);
  const [row] = await getDb()
    .update(menuItems)
    .set({ isAvailable })
    .where(eq(menuItems.id, idParam(c)))
    .returning({ id: menuItems.id, isAvailable: menuItems.isAvailable });
  if (!row) throw notFound("That dish");
  return c.json(row);
});

authed.patch("/variants/:id/availability", async (c) => {
  const { isAvailable } = await body(c, availabilitySchema);
  const [row] = await getDb()
    .update(itemVariants)
    .set({ isAvailable })
    .where(eq(itemVariants.id, idParam(c)))
    .returning({ id: itemVariants.id, isAvailable: itemVariants.isAvailable });
  if (!row) throw notFound("That option");
  return c.json(row);
});

authed.post("/items/availability", async (c) => {
  const { categoryId, isAvailable } = await body(c, bulkAvailabilitySchema);
  const rows = await getDb()
    .update(menuItems)
    .set({ isAvailable })
    .where(eq(menuItems.categoryId, categoryId))
    .returning({ id: menuItems.id });
  return c.json({ updated: rows.length });
});

// ---- Presets ---------------------------------------------------------------------

async function presetList(): Promise<Preset[]> {
  const db = getDb();
  const [ps, links] = await Promise.all([
    db.select().from(presets).orderBy(asc(presets.sort), asc(presets.id)),
    db.select().from(presetItems),
  ]);
  const byPreset = Map.groupBy(links, (l) => l.presetId);
  return ps.map((p) => ({ id: p.id, name: p.name, sort: p.sort, itemIds: (byPreset.get(p.id) ?? []).map((l) => l.itemId) }));
}

authed.get("/presets", async (c) => c.json({ presets: await presetList() }));

async function savePreset(id: number | null, input: { name: string; itemIds: number[] }) {
  return getDb().transaction(async (tx) => {
    let presetId = id;
    if (presetId === null) {
      const [{ m } = { m: 0 }] = await tx.select({ m: sql<number>`coalesce(max(${presets.sort}), 0)` }).from(presets);
      const [row] = await tx.insert(presets).values({ name: input.name, sort: Number(m) + 1 }).returning({ id: presets.id });
      presetId = row!.id;
    } else {
      const [row] = await tx.update(presets).set({ name: input.name }).where(eq(presets.id, presetId)).returning({ id: presets.id });
      if (!row) throw notFound("That preset");
    }
    await tx.delete(presetItems).where(eq(presetItems.presetId, presetId));
    const ids = [...new Set(input.itemIds)];
    if (ids.length) {
      const existing = await tx.select({ id: menuItems.id }).from(menuItems).where(inArray(menuItems.id, ids));
      if (existing.length) await tx.insert(presetItems).values(existing.map((e) => ({ presetId: presetId!, itemId: e.id })));
    }
    return presetId;
  });
}

authed.post("/presets", async (c) => {
  const id = await savePreset(null, await body(c, presetSchema));
  return c.json({ id }, 201);
});

authed.put("/presets/:id", async (c) => {
  const id = await savePreset(idParam(c), await body(c, presetSchema));
  return c.json({ id });
});

authed.delete("/presets/:id", async (c) => {
  const [row] = await getDb().delete(presets).where(eq(presets.id, idParam(c))).returning();
  if (!row) throw notFound("That preset");
  return c.json({ ok: true });
});

/** Makes exactly the preset's dishes available and switches every other dish off. */
authed.post("/presets/:id/apply", async (c) => {
  const id = idParam(c);
  const result = await getDb().transaction(async (tx) => {
    const [p] = await tx.select().from(presets).where(eq(presets.id, id));
    if (!p) throw notFound("That preset");
    const links = await tx.select({ itemId: presetItems.itemId }).from(presetItems).where(eq(presetItems.presetId, id));
    const ids = links.map((l) => l.itemId);
    const on = ids.length
      ? await tx.update(menuItems).set({ isAvailable: true }).where(inArray(menuItems.id, ids)).returning({ id: menuItems.id })
      : [];
    const off = await tx
      .update(menuItems)
      .set({ isAvailable: false })
      .where(ids.length ? notInArray(menuItems.id, ids) : sql`true`)
      .returning({ id: menuItems.id });
    return { name: p.name, available: on.length, hidden: off.length };
  });
  return c.json(result);
});

// ---- Announcements -------------------------------------------------------------------

const annDto = (a: typeof announcements.$inferSelect): AdminAnnouncement => ({
  id: a.id,
  text: a.text,
  kind: a.kind,
  isActive: a.isActive,
  startsAt: a.startsAt?.toISOString() ?? null,
  endsAt: a.endsAt?.toISOString() ?? null,
});

function annValues(input: Awaited<ReturnType<typeof announcementSchema.parse>>) {
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new HttpError(422, "The end time must be after the start time.", { endsAt: "Pick a time after the start." });
  }
  return { text: input.text, kind: input.kind, isActive: input.isActive, startsAt, endsAt };
}

authed.get("/announcements", async (c) => {
  const rows = await getDb().select().from(announcements).orderBy(desc(announcements.createdAt));
  return c.json({ announcements: rows.map(annDto) });
});

authed.post("/announcements", async (c) => {
  const [row] = await getDb().insert(announcements).values(annValues(await body(c, announcementSchema))).returning();
  return c.json({ announcement: annDto(row!) }, 201);
});

authed.put("/announcements/:id", async (c) => {
  const id = idParam(c);
  const [row] = await getDb().update(announcements).set(annValues(await body(c, announcementSchema))).where(eq(announcements.id, id)).returning();
  if (!row) throw notFound("That announcement");
  return c.json({ announcement: annDto(row) });
});

authed.delete("/announcements/:id", async (c) => {
  const [row] = await getDb().delete(announcements).where(eq(announcements.id, idParam(c))).returning();
  if (!row) throw notFound("That announcement");
  return c.json({ ok: true });
});

// ---- Settings ------------------------------------------------------------------------------

authed.get("/settings", async (c) => c.json({ settings: settingsDto(await loadSettings(getDb())) }));

/** Any staff member can pause or resume orders. */
authed.put("/settings/accepting", async (c) => {
  const { acceptingOrders } = await body(c, acceptingSchema);
  const db = getDb();
  await loadSettings(db);
  const [row] = await db.update(settings).set({ acceptingOrders }).where(eq(settings.id, 1)).returning();
  return c.json({ settings: settingsDto(row!) });
});

authed.put("/settings", requireOwner, async (c) => {
  const input = await body(c, settingsSchema);
  const db = getDb();
  await loadSettings(db);
  const [row] = await db.update(settings).set(input).where(eq(settings.id, 1)).returning();
  return c.json({ settings: settingsDto(row!) });
});

// ---- Staff accounts (owner only) ---------------------------------------------------------------

const userDto = (s: typeof staff.$inferSelect): StaffUser => ({ id: s.id, name: s.name, phone: s.phone, role: s.role, isActive: s.isActive });

authed.get("/users", requireOwner, async (c) => {
  const rows = await getDb().select().from(staff).orderBy(desc(staff.isActive), asc(staff.name));
  return c.json({ users: rows.map(userDto) });
});

authed.post("/users", requireOwner, async (c) => {
  const input = await body(c, staffCreateSchema);
  const db = getDb();
  const [clash] = await db.select({ id: staff.id }).from(staff).where(eq(staff.phone, input.phone));
  if (clash) throw new HttpError(409, "Someone already uses this phone number.", { phone: "This number is already registered." });
  const [row] = await db
    .insert(staff)
    .values({ name: input.name, phone: input.phone, role: input.role, passwordHash: await bcrypt.hash(input.password, 10) })
    .returning();
  return c.json({ user: userDto(row!) }, 201);
});

authed.patch("/users/:id", requireOwner, async (c) => {
  const id = idParam(c);
  const input = await body(c, staffUpdateSchema);
  const db = getDb();
  const me = c.get("staff");
  if (id === me.id && (input.isActive === false || input.role === "staff")) {
    throw new HttpError(422, "You cannot switch off or demote your own account. Ask another owner to do it.");
  }
  const [row] = await db.select().from(staff).where(eq(staff.id, id));
  if (!row) throw notFound("That staff member");
  const revoke = input.password !== undefined || input.isActive === false || (input.role && input.role !== row.role);
  const [updated] = await db
    .update(staff)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 10) } : {}),
      ...(revoke ? { sessionVersion: row.sessionVersion + 1 } : {}),
    })
    .where(eq(staff.id, id))
    .returning();
  return c.json({ user: userDto(updated!) });
});

staffRoutes.route("/", authed);

