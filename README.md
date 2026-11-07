# Ananth Residency — online ordering

Delivery ordering for Ananth Residency, Station Road, Hubballi. Customers browse the live menu, sign in with a phone OTP, and place an order; the restaurant gets it on a live dashboard with a ringing alert, calls the customer to confirm, and moves it through to delivery.

- **Customer site** (`/`): menu with search and categories, cart, checkout with saved addresses, pay on delivery or online (Razorpay), live order status, order history with "Order again".
- **Restaurant dashboard** (`/staff`): orders board (New / In progress / Done today), sound and browser-notification alerts, pause-orders switch, menu manager with a switch on every dish and option, Breakfast / Lunch / Dinner presets, announcements, delivery fee / free-delivery threshold / GST settings, staff accounts.

Product decisions and open questions live in [PRODUCT.md](PRODUCT.md).

## Stack

| Layer | Choice |
|---|---|
| Frontend | Vite 8, React 19, TypeScript, Tailwind CSS 4, React Router |
| API | Hono (`server/`), run by Bun locally and as one Vercel Function (`api/index.ts`) |
| Database | Postgres via Drizzle ORM + postgres.js (Neon in production) |
| Customer sign-in | Firebase Phone Auth; ID tokens verified on the server with `jose` |
| Staff sign-in | Phone or name + password (bcrypt), httpOnly session cookie |
| Payments | Pay on delivery; Razorpay Checkout when keys are set |

Money is stored in paise, GST in basis points, times in UTC (shown in Asia/Kolkata). The bill rule is one function, `shared/bill.ts`, used by both the cart and the server.

## Run locally

Needs [Bun](https://bun.sh) 1.4+ and a Postgres database.

```bash
bun install
cp .env.example .env        # then fill in DATABASE_URL, SESSION_SECRET, OWNER_* 
bun run db:setup            # create tables, seed the menu, presets, settings and the owner account
bun run dev                 # web on http://localhost:5173, API on :3001
```

Without Firebase settings, sign-in runs in development mode: any Indian mobile number, code `123456`. This only works when `DEV_OTP=true` and never on a Vercel production deployment.

Other commands:

```bash
bun run check               # lint (with accessibility rules) + typecheck + API tests + production build
bun run test                # API tests; needs TEST_DATABASE_URL (defaults to postgres://postgres@localhost:5544/ananth_test)
bun run db:seed -- --reset  # replace the menu with the seed in server/db/menu-data.ts (orders are kept)
bun run db:generate         # after changing server/db/schema.ts, create a migration in drizzle/
```

## Deploy to Vercel

1. **Database.** In the Vercel project, add the Neon integration (Storage → Postgres). Copy the **pooled** connection string into `DATABASE_URL`.
2. **Firebase.** Create a Firebase project, switch it to the Blaze plan (phone sign-in sends paid SMS), enable *Authentication → Sign-in method → Phone*, and add your Vercel domain under *Authentication → Settings → Authorised domains*. From *Project settings → Your apps → Web app*, copy the config into the `VITE_FIREBASE_*` variables, and set `FIREBASE_PROJECT_ID`.
3. **Environment variables** in Vercel: `DATABASE_URL`, `SESSION_SECRET` (long random string), `FIREBASE_PROJECT_ID`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. Do **not** set `DEV_OTP` in production.
4. **First deploy.** Push the repository and import it in Vercel (framework preset: Vite; `vercel.json` sets the build). Then, from your machine with the production `DATABASE_URL` and `OWNER_*` values in `.env`, run `bun run db:setup` once.
5. **Razorpay (optional).** Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. In the Razorpay dashboard add a webhook to `https://<your-domain>/api/payments/razorpay/webhook` for `payment.captured` and `order.paid`. Then the owner turns on *Settings → Offer online payment*.

## How ordering works

1. Customer adds dishes; the cart shows items total, GST, delivery fee (₹50 under ₹500, free from ₹500; both editable) and the total.
2. At checkout they sign in with their phone, pick or add an address, choose pay on delivery or online, and place the order. The server re-prices everything from the database and rejects dishes that were switched off.
3. The dashboard rings until someone taps **Acknowledge**. Staff call the customer on the number shown, then tap **Confirmed on call**, **Start preparing**, **Out for delivery**, **Delivered**. The customer's order page follows along.
4. Online-payment orders reach the kitchen only after Razorpay confirms payment.

## Daily use for the restaurant

- **Morning:** Presets → *Apply Breakfast*. **Noon:** *Apply Lunch*. **Evening:** *Apply Dinner*. Each turns its dishes on and every other dish off.
- **A dish runs out:** Menu → find it → switch it off. It disappears for customers within a minute.
- **Too busy or closing:** flip *Taking orders* in the top bar. Customers can browse but not check out.
- **New staff member:** Team (owner only) → *Add staff member*.

## Brand assets

The wordmark is typographic, after the hotel signboard. To use a real logo, add `public/brand/logo.svg` and set `logo` in `src/lib/brand.ts`. Replace `public/brand/hero.jpg` (currently a 700 px photo from the group's blog) with a high-resolution photo of the restaurant.
