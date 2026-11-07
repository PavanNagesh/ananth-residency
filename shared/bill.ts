/**
 * The one billing rule, shared by the cart (browser) and order placement (server)
 * so the customer always sees exactly what will be charged. All amounts in paise.
 */
export type Pricing = {
  deliveryFeePaise: number;
  freeDeliveryThresholdPaise: number;
  /** GST in basis points: 500 = 5 %. */
  gstBps: number;
};

export type Bill = {
  subtotalPaise: number;
  gstPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  /** How much more the customer must add to get free delivery (0 when already free). */
  remainingForFreeDeliveryPaise: number;
};

export function computeBill(subtotalPaise: number, pricing: Pricing): Bill {
  const subtotal = Math.max(0, Math.round(subtotalPaise));
  const gstPaise = Math.round((subtotal * pricing.gstBps) / 10_000);
  const qualifiesForFree = subtotal >= pricing.freeDeliveryThresholdPaise;
  const deliveryFeePaise = subtotal === 0 || qualifiesForFree ? 0 : pricing.deliveryFeePaise;
  return {
    subtotalPaise: subtotal,
    gstPaise,
    deliveryFeePaise,
    totalPaise: subtotal + gstPaise + deliveryFeePaise,
    remainingForFreeDeliveryPaise: qualifiesForFree ? 0 : pricing.freeDeliveryThresholdPaise - subtotal,
  };
}

const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,234 or ₹1,234.50 — whole rupees drop the decimals. */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return Number.isInteger(rupees) ? inrWhole.format(rupees) : inrPaise.format(rupees);
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function formatPercentFromBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0$/, "")}%`;
}
