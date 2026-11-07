import { z } from "zod";
import { normalizeIndianPhone, PHONE_ERROR } from "./phone.js";

/** Request bodies, validated on the server; the browser reuses them for form checks. */

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeIndianPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: PHONE_ERROR });
      return z.NEVER;
    }
    return n;
  });

const name = (label: string, max = 80) =>
  z.string().trim().min(1, `Enter ${label}.`).max(max, `Keep ${label} under ${max} characters.`);

export const devOtpSchema = z.object({ phone: phoneSchema, code: z.string().trim() });
export const firebaseLoginSchema = z.object({ idToken: z.string().min(20) });
export const profileSchema = z.object({ name: name("your name", 60) });

export const addressSchema = z.object({
  label: z.string().trim().max(30).default("Home"),
  line1: z.string().trim().min(5, "Enter the house number, building and street.").max(200),
  landmark: z.string().trim().max(120).default(""),
  area: z.string().trim().min(2, "Enter the area or locality, like Vidyanagar.").max(80),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit PIN code, like 580020."),
  isDefault: z.boolean().default(false),
});

export const placeOrderSchema = z.object({
  lines: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        variantId: z.number().int().positive().nullable().default(null),
        qty: z.number().int().min(1).max(50),
      }),
    )
    .min(1, "Your cart is empty. Add a dish to place an order.")
    .max(60),
  addressId: z.number().int().positive({ message: "Choose a delivery address." }),
  paymentMethod: z.enum(["cod", "online"]),
  note: z.string().trim().max(300, "Keep the note under 300 characters.").default(""),
});

export const staffLoginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your phone number or name."),
  password: z.string().min(1, "Enter your password."),
});

export const staffOrderActionSchema = z.object({
  action: z.enum(["ack", "confirm", "preparing", "out_for_delivery", "delivered", "cancel"]),
  reason: z.string().trim().max(200).optional(),
});

const paise = z.number().int().min(0).max(10_000_000);

export const categorySchema = z.object({
  name: name("a category name", 60),
  note: z.string().trim().max(160).default(""),
  sort: z.number().int().min(0).max(10_000).default(0),
  isActive: z.boolean().default(true),
});

export const itemSchema = z.object({
  categoryId: z.number().int().positive(),
  name: name("a dish name", 80),
  description: z.string().trim().max(240).default(""),
  pricePaise: paise,
  isAvailable: z.boolean().default(true),
  sort: z.number().int().min(0).max(10_000).default(0),
  variants: z
    .array(
      z.object({
        id: z.number().int().positive().optional(),
        name: name("an option name", 40),
        pricePaise: paise,
        isAvailable: z.boolean().default(true),
      }),
    )
    .max(12)
    .default([]),
});

export const availabilitySchema = z.object({ isAvailable: z.boolean() });
export const bulkAvailabilitySchema = z.object({
  categoryId: z.number().int().positive(),
  isAvailable: z.boolean(),
});

export const presetSchema = z.object({
  name: name("a preset name", 40),
  itemIds: z.array(z.number().int().positive()).max(2000).default([]),
});

export const announcementSchema = z.object({
  text: z.string().trim().min(3, "Write the announcement.").max(200, "Keep it under 200 characters."),
  kind: z.enum(["info", "offer", "alert"]).default("info"),
  isActive: z.boolean().default(true),
  startsAt: z.iso.datetime({ offset: true }).nullable().default(null),
  endsAt: z.iso.datetime({ offset: true }).nullable().default(null),
});

export const settingsSchema = z.object({
  restaurantName: name("the restaurant name", 80),
  restaurantPhone: phoneSchema,
  restaurantAddress: z.string().trim().min(5).max(200),
  acceptingOrders: z.boolean(),
  pausedMessage: z.string().trim().max(160),
  prepTimeMinutes: z.number().int().min(5).max(180),
  deliveryFeePaise: paise,
  freeDeliveryThresholdPaise: paise,
  gstBps: z.number().int().min(0).max(2800),
  onlinePaymentEnabled: z.boolean(),
});

export const acceptingSchema = z.object({ acceptingOrders: z.boolean() });

const password = z.string().min(8, "Use at least 8 characters for the password.").max(72);

export const staffCreateSchema = z.object({
  name: name("a name", 60),
  phone: phoneSchema,
  password,
  role: z.enum(["owner", "staff"]).default("staff"),
});

export const staffUpdateSchema = z.object({
  name: name("a name", 60).optional(),
  role: z.enum(["owner", "staff"]).optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
});

export const changePasswordSchema = z.object({ current: z.string().min(1, "Enter your current password."), next: password });

export const razorpayVerifySchema = z.object({
  orderId: z.number().int().positive(),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});
