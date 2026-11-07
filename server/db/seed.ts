import bcrypt from "bcryptjs";
import { count, sql } from "drizzle-orm";
import { normalizeIndianPhone } from "../../shared/phone.js";
import { closeDb, getDb, type DB } from "./index.js";
import { MENU, PRESETS } from "./menu-data.js";
import { categories, itemVariants, menuItems, presetItems, presets, settings, staff } from "./schema.js";

/**
 * Seeds settings, the menu, presets and the first owner account.
 * Idempotent: the menu is only inserted into an empty database unless `reset` is true
 * (reset wipes menu, presets and announcements — never orders, customers or staff).
 */
export async function seed(db: DB, opts: { reset?: boolean; log?: boolean } = {}) {
  const log = opts.log ? console.log : () => {};

  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();

  if (opts.reset) {
    // Orders keep their own snapshot of names and prices, so the menu can be replaced safely.
    await db.execute(
      sql`truncate preset_items, presets, item_variants, menu_items, categories, announcements restart identity cascade`,
    );
  }

  const [{ n: existing } = { n: 0 }] = await db.select({ n: count() }).from(categories);
  if (existing === 0) {
    const presetIds = new Map<string, number>();
    for (const [i, p] of PRESETS.entries()) {
      const [row] = await db.insert(presets).values({ name: p.name, sort: i }).returning({ id: presets.id });
      presetIds.set(p.key, row!.id);
    }

    let itemCount = 0;
    for (const [ci, cat] of MENU.entries()) {
      const [c] = await db
        .insert(categories)
        .values({ name: cat.name, note: cat.note ?? "", sort: (ci + 1) * 10 })
        .returning({ id: categories.id });
      for (const [ii, item] of cat.items.entries()) {
        const [m] = await db
          .insert(menuItems)
          .values({
            categoryId: c!.id,
            name: item.name,
            description: item.description ?? "",
            pricePaise: item.price * 100,
            sort: (ii + 1) * 10,
          })
          .returning({ id: menuItems.id });
        if (item.variants?.length) {
          await db.insert(itemVariants).values(
            item.variants.map((v, vi) => ({ itemId: m!.id, name: v.name, pricePaise: v.price * 100, sort: vi })),
          );
        }
        const keys = (item.presets ?? cat.presets).split("");
        const rows = keys.flatMap((k) => (presetIds.has(k) ? [{ presetId: presetIds.get(k)!, itemId: m!.id }] : []));
        if (rows.length) await db.insert(presetItems).values(rows);
        itemCount++;
      }
    }
    log(`Seeded ${MENU.length} categories, ${itemCount} dishes and ${PRESETS.length} presets.`);
  } else {
    log("Menu already present; left unchanged (run with --reset to replace it).");
  }

  const [{ n: staffCount } = { n: 0 }] = await db.select({ n: count() }).from(staff);
  if (staffCount === 0) {
    const phone = normalizeIndianPhone(process.env.OWNER_PHONE ?? "");
    const password = process.env.OWNER_PASSWORD ?? "";
    if (!phone || password.length < 8) {
      log("No staff yet. Set OWNER_PHONE and OWNER_PASSWORD (8+ characters) in .env and run the seed again to create the owner.");
    } else {
      await db.insert(staff).values({
        name: process.env.OWNER_NAME?.trim() || "Owner",
        phone,
        passwordHash: await bcrypt.hash(password, 10),
        role: "owner",
      });
      log(`Created owner account for ${phone}.`);
    }
  }
}

if (import.meta.main) {
  await seed(getDb(), { reset: process.argv.includes("--reset"), log: true });
  await closeDb();
}
