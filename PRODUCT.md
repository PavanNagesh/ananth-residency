# Product

<!-- glyph:product-schema 1 -->

## Brand
Client: **Ananth Residency**, Station Road, behind LIC Office, J C Nagar, Hubballi, Karnataka 580020. Part of the Ananth Group (Ananth Residency, Ananth Executive, Om – The Vegetarian). Built by Glyph Software. Glyph's visual identity is **not** applied; Glyph's method, craft floor and WCAG 2.2 AA standard are.

Brand evidence on hand: the hotel signboard (gold lettering on deep maroon, bilingual "ಅನಂತ ರೆಸಿಡೆನ್ಸಿ / ANANTH RESIDENCY") and the printed menu (maroon border, cream page, gold frame corners). No logo file exists publicly; the wordmark is typographic until the owner supplies one (drop it at `public/brand/logo.svg` and switch `BRAND.logo` in `src/lib/brand.ts`).

## Scope
A web app for delivery orders, replacing phone + WhatsApp-menu ordering.
- **Customer side**: browse the live menu, sign in with phone OTP, keep a cart, checkout with a saved address, choose pay on delivery or online, follow the order status.
- **Restaurant side** (`/staff`): receive orders live with a ringing alert, call the customer to confirm, move the order through its statuses; switch dishes on/off individually or with Breakfast / Lunch / Dinner presets; edit menu, announcements, fees and GST; manage staff logins.

## Users
- **Customers**: Hubballi residents ordering on their phones, often on mobile data. Job: order dinner for the family in under two minutes without calling.
- **Restaurant staff**: counter/manager staff on a shared phone, tablet or PC. Job: never miss an order; switch the menu for the time of day in one tap.
- **Owner**: sets fees, GST, staff accounts.

## Surfaces and modes
| Surface | Mode | Outcome |
|---|---|---|
| Home / menu | Operate, with one Persuade hero | Customer adds dishes to the cart within seconds |
| Checkout, order status, account | Operate | Order placed; customer knows the restaurant will call |
| Staff dashboard | Operate | New order seen and acknowledged within one polling cycle (≤ 8 s) |

## Platform and stack
- Platform: web (mobile-first, installable PWA)
- Framework: Vite 8 + React 19 + TypeScript (scaffolded with glyph-studio `setup_vite.sh`; TypeScript as pinned by create-vite)
- Runtime / package manager: Bun (local), Node runtime on Vercel for the API function
- Backend: Hono API in `server/`, served locally by `server/dev.ts` (Bun.serve on :3001) and on Vercel by `api/index.ts`
- Database: Postgres via Drizzle ORM + postgres.js. Production: Neon (Vercel integration, pooled URL). Local: any Postgres.
- Auth: customers via Firebase Phone Auth (ID token verified server-side with `jose`); staff via name/phone + password (bcrypt). Both get an httpOnly session cookie.
- Payments: pay on delivery, or Razorpay when keys are configured.
- Deploy target: Vercel

## Business rules
- Delivery fee ₹50 below ₹500 subtotal; free at ₹500 and above. Both editable.
- GST shown as its own line, default 5 %, editable (stored in basis points).
- Prices stored in paise. Times stored UTC, shown in Asia/Kolkata.
- Ordering is always open unless staff pause it ("Accepting orders" switch).
- Unavailable dishes disappear from the customer menu.
- Applying a preset makes exactly its dishes available and hides the rest; individual switches still work afterwards.
- Order numbers restart daily (`#001`, `#002`, … per IST day).
- Online-payment orders reach the kitchen only after payment succeeds.

## Theming
Light by default, dark follows the system. Tokens in `src/styles/tokens.css`.

## Content and evidence on hand
- Menu: transcribed from four photographed pages into `server/db/menu-data.ts`.
- Photos: `public/brand/hero.jpg` (restaurant interior) and `public/brand/exterior.jpg`, both 700 px wide, taken from the group's own blog (ananthgroup.wordpress.com). **Placeholders** — replace with high-resolution photos.
- No dish photos, logo, testimonials or ratings exist. None are invented.

## Accessibility, language and compliance
WCAG 2.2 AA. English (en-IN), INR. Strings kept simple for a later Kannada translation.

## Open decisions
| Decision | Who | Blocks |
|---|---|---|
| Uncertain prices on the Chinese-starters page (Paneer Schezwan Dry, Veg Gold Coin, Mushroom Manchurian/Chilly) and soup "Sweet Corn" (partly obscured) | Restaurant | Nothing; editable in the dashboard |
| Ice-cream columns read as single/double scoop | Restaurant | Nothing; editable |
| Breakfast preset contents (menu has no breakfast section) | Restaurant | Nothing; seeded with breads, dal and chana as a starting point |
| Logo file, high-res photos | Restaurant | Visual polish only |
| Firebase project (Blaze plan), Neon database, Razorpay account | Owner / Pavan | Production launch |
| Kannada translation | Owner | Nothing in v1 |
