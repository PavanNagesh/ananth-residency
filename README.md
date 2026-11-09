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

## Phones, tablets and browsers

The site is built mobile-first and checked on phones, tablets, laptops and desktops.

- **Browsers:** Chrome and Edge 87+, Safari on iPhone and iPad (iOS 14+), Samsung Internet 14+, Firefox 90+. Newer colour formats get plain fallbacks, and sheets fall back to a simple overlay on iOS 15.0–15.3.
- **Touch:** controls are at least 44 px on touch screens, inputs are 16 px so iPhones don't zoom, and double-tap zoom is off on buttons.
- **Home screen:** customers can add the site to their home screen. Chrome and Samsung Internet show an install button; iPhones get Share → Add to Home Screen steps. The offer appears after a first order and on the Account page.
- **Restaurant tablet:** on *Staff → Settings*, "Install orders screen on this device" adds an **Ananth Orders** app that opens straight to the orders board.
- **Sharing:** *Staff → Settings* has the ordering link, a WhatsApp share, and a QR code to download for menus, bills and the counter.
- **Weak connections:** a service worker keeps the app shell, fonts and photo, so repeat visits open fast. A dropped connection shows the app's own "you seem to be offline" message. Menu, orders and prices always come live from the server.

### Device tests

`e2e/devices.e2e.ts` runs a full customer order and a staff session on 11 device profiles, using real Chromium, Firefox and WebKit (Safari's engine): small Android, Pixel 7, iPhone SE, iPhone 15 Pro Max, iPhone landscape, Galaxy Tab, iPad Mini, iPad landscape, a 1366 px laptop, a 1440 px MacBook, and a 1920 px Firefox desktop. On every screen it checks for sideways scrolling, content cut off at the edge, tap targets under 24 px (under 40 px on touch screens), inputs that make iOS zoom, and browser errors.

```bash
npx playwright install chromium firefox webkit   # once
bun run test:devices                             # needs the dev database and OWNER_* in .env
bun run test:devices:report                      # open the HTML report
```

Screenshots of every screen on every device are saved in `test-results/devices/`.

## Deploy to Vercel

The build is configured in `vercel.json`: Bun installs and builds, `dist/` is served as the site, and `api/index.ts` becomes one Node 22 function that handles every `/api/*` request. Every other path falls back to `index.html`.

**1. Push to GitHub.** Create an empty **private** repository on github.com (no README or licence), then:

```bash
git remote add origin https://github.com/<you>/ananth-residency.git
git push -u origin main
```

**2. Create the Vercel project.** On vercel.com choose *Add New → Project*, import the repository and keep the detected settings. The first build succeeds, but the app needs the steps below before it works.

**3. Add the database.** In the project, open *Storage → Create → Neon (Postgres)* and connect it to the project. Copy the **pooled** connection string; it is the one whose host contains `-pooler`.

**4. Set up Firebase phone sign-in.**
- Create a project at console.firebase.google.com and upgrade it to the **Blaze** plan. Phone sign-in sends SMS, which is billed per message.
- Enable *Authentication → Sign-in method → Phone*.
- Add your domains under *Authentication → Settings → Authorised domains*: the `*.vercel.app` domain and any custom domain.
- Under *Project settings → Your apps*, add a **Web** app and copy its config.
- Optional: add test numbers under *Phone → Phone numbers for testing*, so you can try sign-in without real SMS.

**5. Set environment variables** in *Vercel → Settings → Environment Variables*, for Production and Preview:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `SESSION_SECRET` | 48+ random characters. Generate with `bun -e "console.log(crypto.randomUUID()+crypto.randomUUID())"` |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | From the Firebase web app config |

Also set `APP_ORIGINS` to your site address (for example `https://order.ananthresidency.in`). Do **not** set `DEV_OTP`; the server refuses the development code on every Vercel deployment anyway. Before launch, go through the account settings in [SECURITY.md](SECURITY.md).

**6. Create the tables and the owner account** once, from your computer. Put the production `DATABASE_URL` and the owner's real `OWNER_NAME`, `OWNER_PHONE` and `OWNER_PASSWORD` into `.env`, then run:

```bash
bun run db:setup
```

Afterwards, switch `.env` back to your local database.

**7. Redeploy** from the Vercel dashboard, so the build picks up the `VITE_FIREBASE_*` values. Then open the site, place a test order, and sign in at `/staff` with the owner's phone number and password.

**8. Razorpay (optional, any time later).**
- Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` in Vercel, then redeploy.
- In the Razorpay dashboard, add a webhook to `https://<your-domain>/api/payments/razorpay/webhook` for `payment.captured` and `order.paid`.
- The owner then turns on *Settings → Offer online payment*.

**Schema changes later:** edit `server/db/schema.ts`, then run `bun run db:generate` and commit the new file in `drizzle/`. Run `bun run db:migrate` against production before or right after deploying.

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
