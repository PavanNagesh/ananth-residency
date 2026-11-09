import { expect, test } from "@playwright/test";
import { computeBill, formatRupees } from "../shared/bill";
import { formatPhone } from "../shared/phone";
import { checkScreen, phoneFor, press, watchErrors } from "./helpers";

/**
 * One customer order and one staff session on every device profile in playwright.config.ts.
 * Each screen is measured (sideways scroll, cut-off content, tap sizes, iOS zoom) and screenshotted.
 */
test.describe.configure({ mode: "serial" });

let orderNo = "";

test("customer can browse, fill a cart and place an order", async ({ page, request }, info) => {
  const errors = watchErrors(page);
  const menu = await (await request.get("/api/menu")).json();
  const wide = (page.viewportSize()?.width ?? 0) >= 1024;

  await test.step("menu opens", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pure vegetarian");
    await expect(page.getByRole("heading", { name: "Lunch Thali" })).toBeVisible();
    await checkScreen(page, info, "01-home");
  });

  await test.step("search finds a dish and it goes into the cart", async () => {
    const search = page.getByRole("searchbox", { name: "Search the menu" });
    await search.fill("paneer butter");
    await expect(page.getByText(/1 dish matches/)).toBeVisible();
    await press(page.getByRole("button", { name: "Add Paneer Butter Masala" }), info);
    // Scoped to the menu: wide screens also show the same control in the cart sidebar.
    await expect(page.getByRole("region", { name: "North Indian Curries" }).getByRole("group", { name: "Quantity of Paneer Butter Masala" })).toBeVisible();
    await checkScreen(page, info, "02-search");
  });

  await test.step("a dish with options opens the option sheet", async () => {
    const search = page.getByRole("searchbox", { name: "Search the menu" });
    await search.fill("naan");
    await press(page.getByRole("button", { name: "Add Naan", exact: true }), info);
    const sheet = page.getByRole("dialog", { name: "Naan" });
    await expect(sheet).toBeVisible();
    await checkScreen(page, info, "03-options");
    await press(sheet.getByText("With butter"), info);
    await press(sheet.getByRole("button", { name: /^Add · / }), info);
    await expect(sheet).toBeHidden();
    await search.fill("");
  });

  const paneer = menu.categories.flatMap((c: { items: { name: string; pricePaise: number }[] }) => c.items).find((i: { name: string }) => i.name === "Paneer Butter Masala");
  const bill = computeBill(paneer.pricePaise + 7500, menu.pricing);

  await test.step("cart shows the right bill", async () => {
    let cart = page.getByRole("complementary", { name: "Your order" });
    if (!wide) {
      await press(page.getByRole("button", { name: /View cart/ }), info);
      cart = page.getByRole("dialog", { name: "Your order" });
    }
    await expect(cart).toBeVisible();
    await expect(cart.getByText("To pay")).toBeVisible();
    await expect(cart.locator("dd").last()).toHaveText(formatRupees(bill.totalPaise));
    await checkScreen(page, info, "04-cart");
    await press(cart.getByRole("button", { name: /^Checkout/ }), info);
    await expect(page).toHaveURL(/\/checkout$/);
  });

  await test.step("phone sign-in", async () => {
    const number = page.getByLabel("Mobile number");
    if (await number.isVisible()) {
      await checkScreen(page, info, "05-signin");
      await number.fill(phoneFor(info.project.name));
      await press(page.getByRole("button", { name: "Send code" }), info);
      await page.getByLabel("6-digit code").fill("123456");
      await press(page.getByRole("button", { name: "Verify and continue" }), info);
      await expect(page.getByLabel("6-digit code")).toBeHidden();
      const name = page.getByLabel("Your name");
      if (await name.isVisible()) {
        await name.fill(`Test ${info.project.name}`.slice(0, 60));
        await press(page.getByRole("button", { name: "Save and continue" }), info);
        await expect(name).toBeHidden();
      }
    }
  });

  await test.step("address and checkout", async () => {
    const street = page.getByLabel("House, building and street");
    await expect(street.or(page.getByRole("button", { name: "Add a new address" }))).toBeVisible();
    if (await street.isVisible()) {
      await street.fill("Flat 2, Sai Krupa, 3rd Cross, Vidyanagar");
      await page.getByLabel("Landmark").fill("Opposite KLE Tech gate");
      await page.getByLabel("Area").fill("Vidyanagar");
      await page.getByLabel("PIN code").fill("580031");
      await press(page.getByRole("button", { name: "Use my current location" }), info);
      await expect(page.getByRole("region", { name: /drag the pin/ })).toBeVisible();
      await expect(page.getByText(/accurate to about 15 m/)).toBeVisible();
      await checkScreen(page, info, "06-address");
      await press(page.getByRole("button", { name: "Save address" }), info);
    } else if (await page.getByText("This address has no map location.").isVisible()) {
      // Saved before map pins existed: add one from checkout.
      await press(page.getByRole("button", { name: "Add map location" }), info);
      const sheet = page.getByRole("dialog", { name: /Map location for/ });
      await press(sheet.getByRole("button", { name: "Use my current location" }), info);
      await expect(sheet.getByRole("region", { name: /drag the pin/ })).toBeVisible();
      await checkScreen(page, info, "06-address-pin");
      await press(sheet.getByRole("button", { name: "Save location" }), info);
      await expect(page.getByText("This address has no map location.")).toBeHidden();
    }
    await expect(page.getByRole("radio", { name: /Pay on delivery/ })).toBeChecked();
    await checkScreen(page, info, "07-checkout");
    const place = page.getByRole("button", { name: /^Place order/ });
    await place.scrollIntoViewIfNeeded();
    await expect(place).toContainText(formatRupees(bill.totalPaise));
    await press(place, info);
    await expect(page).toHaveURL(/\/orders\/\d+$/);
    await expect(page.getByText("Order placed.")).toBeVisible();
    orderNo = (await page.getByRole("heading", { level: 1 }).textContent())!.replace("Order ", "").trim();
    await checkScreen(page, info, "08-order-status");
  });

  await test.step("account page", async () => {
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Saved addresses" })).toBeVisible();
    await checkScreen(page, info, "09-account");
  });

  expect(errors, "browser errors").toEqual([]);
});

test("restaurant staff can run the dashboard", async ({ page }, info) => {
  const errors = watchErrors(page);
  const phone = process.env.OWNER_PHONE;
  const password = process.env.OWNER_PASSWORD;
  test.skip(!phone || !password, "Set OWNER_PHONE and OWNER_PASSWORD in .env");

  await test.step("sign in", async () => {
    await page.goto("/staff");
    await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();
    await checkScreen(page, info, "10-staff-login");
    await page.getByLabel("Phone number or name").fill(phone!);
    await page.getByLabel("Password").fill(password!);
    await press(page.getByRole("button", { name: "Sign in" }), info);
    await expect(page.getByRole("heading", { name: "Orders", level: 1 })).toBeVisible();
  });

  await test.step("confirm the order this device placed", async () => {
    // Match by number and this device's phone: numbers restart daily, so older unfinished orders can share one.
    const card = page
      .locator("li")
      .filter({ has: page.getByRole("heading", { name: new RegExp(`^${orderNo}\\b`) }) })
      .filter({ hasText: formatPhone(`+91${phoneFor(info.project.name)}`) });
    await expect(card).toBeVisible();
    await checkScreen(page, info, "11-staff-orders");
    // The customer's pin, in the card and then full size, without leaving the page.
    const pages = page.context().pages().length;
    await press(card.getByRole("button", { name: "Show on map" }), info);
    await expect(card.getByRole("region", { name: new RegExp(`delivery location for order ${orderNo}`) })).toBeVisible();
    await expect(card.locator(".leaflet-tile-loaded").first()).toBeVisible({ timeout: 20_000 });
    await card.scrollIntoViewIfNeeded();
    await checkScreen(page, info, "11b-staff-map");
    await press(card.getByRole("button", { name: "Expand map", exact: true }), info);
    const big = page.getByRole("dialog", { name: new RegExp(`^${orderNo}`) });
    await expect(big.getByRole("region", { name: /delivery location/ })).toBeVisible();
    await expect(big.locator(".leaflet-marker-icon")).toBeVisible();
    await checkScreen(page, info, "11c-staff-map-expanded");
    await press(big.getByRole("button", { name: "Close" }), info);
    expect(page.context().pages().length, "map must not open a new tab").toBe(pages);
    expect(page.url()).toContain("/staff");
    await press(card.getByRole("button", { name: "Confirmed on call" }), info);
    await expect(page.getByText(new RegExp(`Order ${orderNo}: Confirmed`))).toBeVisible();
  });

  await test.step("switch a dish off and on", async () => {
    await page.goto("/staff/menu");
    const breads = page.locator("details").filter({ hasText: "Indian Breads" });
    await press(breads.locator("summary"), info);
    // Each device switches its own bread, so devices running in parallel don't interfere.
    const breadsList = ["Garlic Naan", "Roti", "Paratha", "Kulcha", "Aloo Paratha", "Garlic Cheese Naan", "Missi Roti", "Cheese Naan", "Chapati", "Phulka", "Roomali Roti"];
    const dish = breadsList[Math.max(0, info.config.projects.findIndex((p) => p.name === info.project.name)) % breadsList.length]!;
    const toggle = breads.getByRole("switch", { name: `${dish} available`, exact: true });
    const before = await toggle.getAttribute("aria-checked");
    const after = before === "true" ? "false" : "true";
    await press(toggle, info);
    await expect(toggle).toHaveAttribute("aria-checked", after);
    await press(toggle, info);
    await expect(toggle).toHaveAttribute("aria-checked", before!);
    await checkScreen(page, info, "12-staff-menu");
    await press(breads.getByRole("button", { name: `Edit ${dish}`, exact: true }), info);
    await expect(page.getByRole("dialog", { name: `Edit ${dish}` })).toBeVisible();
    await checkScreen(page, info, "13-staff-dish-editor");
    await press(page.getByRole("dialog").getByRole("button", { name: "Close" }), info);
  });

  for (const [path, heading, shot] of [
    ["/staff/presets", "Presets", "14-staff-presets"],
    ["/staff/announcements", "Announcements", "15-staff-announcements"],
    ["/staff/settings", "Settings", "16-staff-settings"],
    ["/staff/team", "Team", "17-staff-team"],
  ] as const) {
    await test.step(heading, async () => {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      await checkScreen(page, info, shot);
    });
  }

  expect(errors, "browser errors").toEqual([]);
});
