import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { computeBill, type Pricing } from "../shared/bill.js";
import { formatOrderNo, istDate } from "../shared/time.js";
import type {
  AddressSnapshot,
  MenuResponse,
  Order,
  OrderLine,
  OrderStatus,
  PaymentMethod,
  Settings,
} from "../shared/types.js";
import type { DB } from "./db/index.js";
import { addresses, announcements, categories, itemVariants, menuItems, orderEvents, orders, settings } from "./db/schema.js";
import { env } from "./env.js";
import { HttpError } from "./http.js";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Q = DB | Tx;

// ---- Settings ----------------------------------------------------------------

export async function loadSettings(db: Q) {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (row) return row;
  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(settings).where(eq(settings.id, 1));
  return again!;
}

type SettingsRow = Awaited<ReturnType<typeof loadSettings>>;

export function onlinePaymentAvailable(s: SettingsRow) {
  return s.onlinePaymentEnabled && env.razorpay !== null;
}

export function pricingOf(s: SettingsRow): Pricing {
  return {
    deliveryFeePaise: s.deliveryFeePaise,
    freeDeliveryThresholdPaise: s.freeDeliveryThresholdPaise,
    gstBps: s.gstBps,
  };
}

export function settingsDto(s: SettingsRow): Settings {
  return {
    restaurantName: s.restaurantName,
    restaurantPhone: s.restaurantPhone,
    restaurantAddress: s.restaurantAddress,
    acceptingOrders: s.acceptingOrders,
    pausedMessage: s.pausedMessage,
    prepTimeMinutes: s.prepTimeMinutes,
    deliveryFeePaise: s.deliveryFeePaise,
    freeDeliveryThresholdPaise: s.freeDeliveryThresholdPaise,
    gstBps: s.gstBps,
    onlinePaymentEnabled: s.onlinePaymentEnabled,
    razorpayConfigured: env.razorpay !== null,
  };
}

// ---- Public menu -------------------------------------------------------------

export async function publicMenu(db: DB): Promise<MenuResponse> {
  const now = new Date();
  const [s, cats, items, variants, notes] = await Promise.all([
    loadSettings(db),
    db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sort), asc(categories.id)),
    db.select().from(menuItems).where(eq(menuItems.isAvailable, true)).orderBy(asc(menuItems.sort), asc(menuItems.id)),
    db.select().from(itemVariants).where(eq(itemVariants.isAvailable, true)).orderBy(asc(itemVariants.sort), asc(itemVariants.id)),
    db
      .select({ id: announcements.id, text: announcements.text, kind: announcements.kind })
      .from(announcements)
      .where(
        and(
          eq(announcements.isActive, true),
          or(isNull(announcements.startsAt), lte(announcements.startsAt, now)),
          or(isNull(announcements.endsAt), gt(announcements.endsAt, now)),
        ),
      )
      .orderBy(desc(announcements.createdAt)),
  ]);

  const variantsByItem = Map.groupBy(variants, (v) => v.itemId);
  const allVariantItems = new Set(
    (await db.selectDistinct({ itemId: itemVariants.itemId }).from(itemVariants)).map((r) => r.itemId),
  );
  const itemsByCat = Map.groupBy(
    items.flatMap((i) => {
      const vs = variantsByItem.get(i.id) ?? [];
      // An item that has options but none available right now is hidden.
      if (allVariantItems.has(i.id) && vs.length === 0) return [];
      return [
        {
          categoryId: i.categoryId,
          dto: {
            id: i.id,
            name: i.name,
            description: i.description,
            pricePaise: vs.length ? Math.min(...vs.map((v) => v.pricePaise)) : i.pricePaise,
            variants: vs.map((v) => ({ id: v.id, name: v.name, pricePaise: v.pricePaise })),
          },
        },
      ];
    }),
    (x) => x.categoryId,
  );

  return {
    restaurant: {
      name: s.restaurantName,
      phone: s.restaurantPhone,
      address: s.restaurantAddress,
      acceptingOrders: s.acceptingOrders,
      pausedMessage: s.pausedMessage,
      prepTimeMinutes: s.prepTimeMinutes,
      onlinePaymentAvailable: onlinePaymentAvailable(s),
    },
    pricing: pricingOf(s),
    announcements: notes,
    categories: cats
      .map((c) => ({ id: c.id, name: c.name, note: c.note, items: (itemsByCat.get(c.id) ?? []).map((x) => x.dto) }))
      .filter((c) => c.items.length > 0),
  };
}

// ---- Orders ------------------------------------------------------------------

type OrderRow = typeof orders.$inferSelect;
type EventRow = typeof orderEvents.$inferSelect;

export function orderDto(o: OrderRow, events: EventRow[] = []): Order {
  return {
    id: o.id,
    orderNo: formatOrderNo(o.dailySeq),
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    address: o.address,
    lines: o.lines,
    note: o.note,
    subtotalPaise: o.subtotalPaise,
    gstPaise: o.gstPaise,
    deliveryFeePaise: o.deliveryFeePaise,
    totalPaise: o.totalPaise,
    cancelReason: o.cancelReason,
    acknowledged: o.acknowledgedAt !== null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    events: events
      .filter((e) => e.orderId === o.id)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map((e) => ({ status: e.status, at: e.at.toISOString(), note: e.note })),
  };
}

export async function ordersWithEvents(db: Q, rows: OrderRow[]): Promise<Order[]> {
  if (rows.length === 0) return [];
  const events = await db
    .select()
    .from(orderEvents)
    .where(inArray(orderEvents.orderId, rows.map((r) => r.id)));
  return rows.map((r) => orderDto(r, events));
}

export type PlaceOrderInput = {
  customer: { id: number; phone: string; name: string };
  lines: { itemId: number; variantId: number | null; qty: number }[];
  addressId: number;
  paymentMethod: PaymentMethod;
  note: string;
};

/**
 * Re-prices the cart from the database (never trusts browser prices), checks availability,
 * and stores the order with a per-day sequence number. Runs in one transaction.
 */
export async function placeOrder(db: DB, input: PlaceOrderInput) {
  if (!input.customer.name.trim()) throw new HttpError(422, "Add your name so the restaurant knows who to ask for.", { name: "Enter your name." });

  return db.transaction(async (tx) => {
    const s = await loadSettings(tx);
    if (!s.acceptingOrders) throw new HttpError(409, s.pausedMessage || "The restaurant is not taking orders right now.");
    if (input.paymentMethod === "online" && !onlinePaymentAvailable(s)) {
      throw new HttpError(422, "Online payment is not available right now. Choose pay on delivery.", { paymentMethod: "Choose pay on delivery." });
    }

    const [addr] = await tx
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, input.addressId), eq(addresses.customerId, input.customer.id), isNull(addresses.deletedAt)));
    if (!addr) throw new HttpError(422, "Choose a delivery address.", { addressId: "Choose a delivery address." });

    // Merge duplicate lines, then load the dishes they refer to.
    const merged = new Map<string, { itemId: number; variantId: number | null; qty: number }>();
    for (const l of input.lines) {
      const key = `${l.itemId}:${l.variantId ?? 0}`;
      const prev = merged.get(key);
      merged.set(key, { ...l, qty: Math.min(50, (prev?.qty ?? 0) + l.qty) });
    }
    const wanted = [...merged.values()];
    const itemIds = [...new Set(wanted.map((l) => l.itemId))];
    const [items, variants, cats] = await Promise.all([
      tx.select().from(menuItems).where(inArray(menuItems.id, itemIds)),
      tx.select().from(itemVariants).where(inArray(itemVariants.itemId, itemIds)),
      tx.select({ id: categories.id, isActive: categories.isActive }).from(categories),
    ]);
    const activeCats = new Set(cats.filter((c) => c.isActive).map((c) => c.id));

    const unavailable: string[] = [];
    const lines: OrderLine[] = [];
    for (const l of wanted) {
      const item = items.find((i) => i.id === l.itemId);
      const itemVariantsList = variants.filter((v) => v.itemId === l.itemId);
      if (!item || !item.isAvailable || !activeCats.has(item.categoryId)) {
        unavailable.push(item?.name ?? "A dish in your cart");
        continue;
      }
      let unit = item.pricePaise;
      let variantName: string | null = null;
      if (itemVariantsList.length > 0) {
        const v = itemVariantsList.find((x) => x.id === l.variantId);
        if (!v || !v.isAvailable) {
          unavailable.push(v ? `${item.name} (${v.name})` : item.name);
          continue;
        }
        unit = v.pricePaise;
        variantName = v.name;
      } else if (l.variantId !== null) {
        unavailable.push(item.name);
        continue;
      }
      lines.push({ itemId: item.id, variantId: l.variantId, name: item.name, variantName, qty: l.qty, unitPricePaise: unit });
    }
    if (unavailable.length) {
      throw new HttpError(409, `${unavailable.join(", ")} ${unavailable.length === 1 ? "is" : "are"} no longer available. Remove ${unavailable.length === 1 ? "it" : "them"} from your cart and place the order again.`, {
        lines: unavailable.join(", "),
      });
    }

    const subtotal = lines.reduce((sum, l) => sum + l.unitPricePaise * l.qty, 0);
    const bill = computeBill(subtotal, pricingOf(s));
    const address: AddressSnapshot = {
      label: addr.label,
      line1: addr.line1,
      landmark: addr.landmark,
      area: addr.area,
      pincode: addr.pincode,
    };

    // Serialise sequence allocation per day.
    const orderDate = istDate();
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('orders-daily-seq'))`);
    const [{ next } = { next: 1 }] = await tx
      .select({ next: sql<number>`coalesce(max(${orders.dailySeq}), 0) + 1` })
      .from(orders)
      .where(eq(orders.orderDate, orderDate));

    const status: OrderStatus = input.paymentMethod === "online" ? "pending_payment" : "new";
    const [order] = await tx
      .insert(orders)
      .values({
        orderDate,
        dailySeq: Number(next),
        customerId: input.customer.id,
        customerName: input.customer.name,
        customerPhone: input.customer.phone,
        address,
        lines,
        note: input.note,
        subtotalPaise: bill.subtotalPaise,
        gstPaise: bill.gstPaise,
        deliveryFeePaise: bill.deliveryFeePaise,
        totalPaise: bill.totalPaise,
        paymentMethod: input.paymentMethod,
        status,
      })
      .returning();
    const [event] = await tx.insert(orderEvents).values({ orderId: order!.id, status }).returning();
    return { order: order!, events: [event!], settings: s };
  });
}

/** Allowed staff transitions. "ack" only silences the alert. */
export const STAFF_TRANSITIONS: Record<string, { from: OrderStatus[]; to: OrderStatus }> = {
  confirm: { from: ["new"], to: "confirmed" },
  preparing: { from: ["new", "confirmed"], to: "preparing" },
  out_for_delivery: { from: ["confirmed", "preparing"], to: "out_for_delivery" },
  delivered: { from: ["confirmed", "preparing", "out_for_delivery"], to: "delivered" },
  cancel: { from: ["pending_payment", "new", "confirmed", "preparing", "out_for_delivery"], to: "cancelled" },
};
