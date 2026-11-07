import type { Pricing } from "./bill.js";

export const ORDER_STATUSES = [
  "pending_payment",
  "new",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ACTIVE_STATUSES: OrderStatus[] = ["new", "confirmed", "preparing", "out_for_delivery"];
export const FINAL_STATUSES: OrderStatus[] = ["delivered", "cancelled"];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  new: "Placed",
  confirmed: "Confirmed",
  preparing: "Preparing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export type PaymentMethod = "cod" | "online";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type AnnouncementKind = "info" | "offer" | "alert";
export type StaffRole = "owner" | "staff";

// ---- Public menu ---------------------------------------------------------

export type MenuVariant = { id: number; name: string; pricePaise: number };
export type MenuItem = {
  id: number;
  name: string;
  description: string;
  pricePaise: number;
  variants: MenuVariant[];
};
export type MenuCategory = { id: number; name: string; note: string; items: MenuItem[] };
export type Announcement = { id: number; text: string; kind: AnnouncementKind };

export type RestaurantInfo = {
  name: string;
  phone: string;
  address: string;
  acceptingOrders: boolean;
  pausedMessage: string;
  prepTimeMinutes: number;
  onlinePaymentAvailable: boolean;
};

export type MenuResponse = {
  restaurant: RestaurantInfo;
  pricing: Pricing;
  announcements: Announcement[];
  categories: MenuCategory[];
};

// ---- Customer ------------------------------------------------------------

export type Customer = { id: number; phone: string; name: string };
export type Address = {
  id: number;
  label: string;
  line1: string;
  landmark: string;
  area: string;
  pincode: string;
  isDefault: boolean;
};

export type OrderLine = {
  itemId: number;
  variantId: number | null;
  name: string;
  variantName: string | null;
  qty: number;
  unitPricePaise: number;
};

export type AddressSnapshot = Omit<Address, "id" | "isDefault">;

export type Order = {
  id: number;
  orderNo: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  customerName: string;
  customerPhone: string;
  address: AddressSnapshot;
  lines: OrderLine[];
  note: string;
  subtotalPaise: number;
  gstPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  cancelReason: string | null;
  acknowledged: boolean;
  createdAt: string;
  updatedAt: string;
  events: { status: OrderStatus; at: string; note: string | null }[];
};

export type RazorpayCheckout = {
  keyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  name: string;
  prefill: { name: string; contact: string };
};

export type PlaceOrderResponse = { order: Order; razorpay: RazorpayCheckout | null };

// ---- Staff ---------------------------------------------------------------

export type StaffUser = { id: number; name: string; phone: string; role: StaffRole; isActive: boolean };

export type AdminVariant = { id: number; name: string; pricePaise: number; isAvailable: boolean; sort: number };
export type AdminItem = {
  id: number;
  categoryId: number;
  name: string;
  description: string;
  pricePaise: number;
  isAvailable: boolean;
  sort: number;
  variants: AdminVariant[];
};
export type AdminCategory = { id: number; name: string; note: string; sort: number; isActive: boolean };
export type AdminMenu = { categories: AdminCategory[]; items: AdminItem[] };

export type Preset = { id: number; name: string; sort: number; itemIds: number[] };

export type AdminAnnouncement = {
  id: number;
  text: string;
  kind: AnnouncementKind;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

export type Settings = {
  restaurantName: string;
  restaurantPhone: string;
  restaurantAddress: string;
  acceptingOrders: boolean;
  pausedMessage: string;
  prepTimeMinutes: number;
  deliveryFeePaise: number;
  freeDeliveryThresholdPaise: number;
  gstBps: number;
  onlinePaymentEnabled: boolean;
  /** Read-only: true when Razorpay keys are present in the server environment. */
  razorpayConfigured: boolean;
};

export type StaffOrdersResponse = {
  orders: Order[];
  summary: { ordersToday: number; revenueTodayPaise: number; unacknowledged: number };
  serverTime: string;
};
