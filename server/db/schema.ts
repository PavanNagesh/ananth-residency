import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AddressSnapshot, AnnouncementKind, OrderLine, OrderStatus, PaymentMethod, PaymentStatus, StaffRole } from "../../shared/types.js";

const id = () => integer().primaryKey().generatedAlwaysAsIdentity();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---- People ----------------------------------------------------------------

export const customers = pgTable("customers", {
  id: id(),
  phone: text().notNull().unique(),
  name: text().notNull().default(""),
  firebaseUid: text("firebase_uid"),
  /** Bumped on sign-out: every existing session for this customer stops working. */
  sessionVersion: integer("session_version").notNull().default(1),
  createdAt: createdAt(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

/** Attempt counters for rate limits (see server/security.ts). Rows expire after their window. */
export const rateLimits = pgTable("rate_limits", {
  key: text().primaryKey(),
  hits: integer().notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

export const addresses = pgTable(
  "addresses",
  {
    id: id(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    label: text().notNull().default("Home"),
    line1: text().notNull(),
    landmark: text().notNull().default(""),
    area: text().notNull(),
    pincode: text().notNull(),
    /** Map pin shared by the customer (GPS, adjusted by dragging). Null when not shared. */
    lat: doublePrecision(),
    lng: doublePrecision(),
    /** GPS accuracy in metres when the pin came from the phone's location; null when placed by hand. */
    accuracyM: integer("accuracy_m"),
    isDefault: boolean("is_default").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("addresses_customer_idx").on(t.customerId)],
);

export const staff = pgTable("staff", {
  id: id(),
  name: text().notNull(),
  phone: text().notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text().$type<StaffRole>().notNull().default("staff"),
  isActive: boolean("is_active").notNull().default(true),
  /** Bumped on password change / deactivation to invalidate existing sessions. */
  sessionVersion: integer("session_version").notNull().default(1),
  createdAt: createdAt(),
});

// ---- Menu ------------------------------------------------------------------

export const categories = pgTable("categories", {
  id: id(),
  name: text().notNull(),
  note: text().notNull().default(""),
  sort: integer().notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const menuItems = pgTable(
  "menu_items",
  {
    id: id(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    name: text().notNull(),
    description: text().notNull().default(""),
    pricePaise: integer("price_paise").notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    sort: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("menu_items_category_idx").on(t.categoryId)],
);

export const itemVariants = pgTable(
  "item_variants",
  {
    id: id(),
    itemId: integer("item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    name: text().notNull(),
    pricePaise: integer("price_paise").notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    sort: integer().notNull().default(0),
  },
  (t) => [index("item_variants_item_idx").on(t.itemId)],
);

export const presets = pgTable("presets", {
  id: id(),
  name: text().notNull(),
  sort: integer().notNull().default(0),
});

export const presetItems = pgTable(
  "preset_items",
  {
    presetId: integer("preset_id")
      .notNull()
      .references(() => presets.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.presetId, t.itemId] })],
);

export const announcements = pgTable("announcements", {
  id: id(),
  text: text().notNull(),
  kind: text().$type<AnnouncementKind>().notNull().default("info"),
  isActive: boolean("is_active").notNull().default(true),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Single row (id = 1). */
export const settings = pgTable("settings", {
  id: integer().primaryKey().default(1),
  restaurantName: text("restaurant_name").notNull().default("Ananth Residency"),
  restaurantPhone: text("restaurant_phone").notNull().default("+918088415720"),
  restaurantAddress: text("restaurant_address")
    .notNull()
    .default("Station Road, behind LIC Office, J C Nagar, Hubballi 580020"),
  acceptingOrders: boolean("accepting_orders").notNull().default(true),
  pausedMessage: text("paused_message").notNull().default("We are not taking delivery orders right now. Please check back soon."),
  prepTimeMinutes: integer("prep_time_minutes").notNull().default(25),
  deliveryFeePaise: integer("delivery_fee_paise").notNull().default(5000),
  freeDeliveryThresholdPaise: integer("free_delivery_threshold_paise").notNull().default(50000),
  gstBps: integer("gst_bps").notNull().default(500),
  onlinePaymentEnabled: boolean("online_payment_enabled").notNull().default(false),
  updatedAt: updatedAt(),
});

// ---- Orders ----------------------------------------------------------------

export const orders = pgTable(
  "orders",
  {
    id: id(),
    orderDate: text("order_date").notNull(),
    dailySeq: integer("daily_seq").notNull(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    address: jsonb().$type<AddressSnapshot>().notNull(),
    lines: jsonb().$type<OrderLine[]>().notNull(),
    note: text().notNull().default(""),
    subtotalPaise: integer("subtotal_paise").notNull(),
    gstPaise: integer("gst_paise").notNull(),
    deliveryFeePaise: integer("delivery_fee_paise").notNull(),
    totalPaise: integer("total_paise").notNull(),
    paymentMethod: text("payment_method").$type<PaymentMethod>().notNull(),
    paymentStatus: text("payment_status").$type<PaymentStatus>().notNull().default("pending"),
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    status: text().$type<OrderStatus>().notNull(),
    cancelReason: text("cancel_reason"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_daily_seq_uq").on(t.orderDate, t.dailySeq),
    index("orders_customer_idx").on(t.customerId, t.createdAt),
    index("orders_status_idx").on(t.status, t.createdAt),
    index("orders_razorpay_idx").on(t.razorpayOrderId).where(sql`razorpay_order_id is not null`),
  ],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: id(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: text().$type<OrderStatus>().notNull(),
    staffId: integer("staff_id").references(() => staff.id),
    note: text(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId)],
);

// ---- Relations (for the relational query API) -------------------------------

export const categoriesRelations = relations(categories, ({ many }) => ({ items: many(menuItems) }));
export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  category: one(categories, { fields: [menuItems.categoryId], references: [categories.id] }),
  variants: many(itemVariants),
}));
export const itemVariantsRelations = relations(itemVariants, ({ one }) => ({
  item: one(menuItems, { fields: [itemVariants.itemId], references: [menuItems.id] }),
}));
export const ordersRelations = relations(orders, ({ many }) => ({ events: many(orderEvents) }));
export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
}));
