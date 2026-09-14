# Pop & Go — Instructions Guide 🍿

Hey! This is your friendly walkthrough for the full-stack version of the Pop
& Go website. It's written so you (or any teammate, on any device — laptop,
tablet, or phone) can follow it without getting lost. Read it top to bottom
the first time; after that, use the table of contents to jump around.

## Table of contents
1. [What changed from the old version](#1-what-changed-from-the-old-version)
2. [One-time Supabase setup (do this first)](#2-one-time-supabase-setup-do-this-first)
3. [Staff accounts only (customers never register)](#3-staff-accounts-only-customers-never-register)
4. [Running the site](#4-running-the-site)
5. [How the pieces fit together](#5-how-the-pieces-fit-together)
6. [Using the site as a customer](#6-using-the-site-as-a-customer)
7. [Using the admin dashboard](#7-using-the-admin-dashboard)
8. [The popcorn-machine pricing model](#8-the-popcorn-machine-pricing-model)
9. [Mobile / small-screen notes](#9-mobile--small-screen-notes)
10. [Functions & files you should know](#10-functions--files-you-should-know)
11. [Troubleshooting](#11-troubleshooting)
12. [What's intentionally left simple](#12-whats-intentionally-left-simple)

---

## 1. What changed from the old version

The old site stored everything in your browser's `localStorage` — so data
never left your device and every visitor saw different "fake" data. This
version is properly full-stack:

- **Real database** — Supabase (hosted Postgres) now stores products,
  inventory, orders, payments and settings. Everyone who visits the site
  sees the *same* real data.
- **Real accounts** — Login/Register use Supabase Auth (real email +
  password accounts), instead of "type anything to log in."
- **Simulated payments, real records** — Checkout still doesn't touch real
  money, but every "purchase" now creates a real row in the database, feeds
  real inventory deduction, and shows up in the admin Reports tab
  automatically.
- **Admin-only pricing data** — Detailed cost/profit numbers moved out of
  the public Pricing page and into the admin dashboard's new **Pricing**
  tab, which is editable.
- **Terms & Conditions** — a new `terms.html` page, linked from the
  homepage and the checkout modal (not cluttering the main menu).

---

## 2. One-time Supabase setup (do this first)

You only need to do this once.

1. Go to your Supabase project: `https://xzzpyjjqhaymhfusskvp.supabase.co`
   (log in at [supabase.com](https://supabase.com) and open the project from
   your dashboard).
2. In the left sidebar, click **SQL Editor** → **New query**.
3. Open the file **`supabase-schema.sql`** (included in this project),
   select all, copy it, and paste it into the SQL Editor.
4. Click **Run**. You should see "Success. No rows returned." This creates
   every table, security rule, and starter data (4 flavours + 6 ingredients)
   in one go. It's safe to run more than once if you ever need to.
5. That's it — the anon (public) key is already wired into
   `assets/js/supabase-client.js`, so the site can talk to your database
   immediately.

> 💡 If you ever rotate your Supabase keys, just update the two constants
> at the top of `assets/js/supabase-client.js`.

---

## 3. Staff accounts only (customers never register)

Customers don't need — and can't easily find — a way to create an account.
Checkout works entirely as a **guest**: they just type their name (and
optionally email) at checkout, and that's stored as plain text on the order
so you can find it later. No login required.

`register.html` still exists, but it's a direct-URL-only page (not linked
from the nav, footer, or `login.html`) meant purely for your six team
members to set themselves up as admins:

1. Go straight to `register.html` on the site and create an account with
   **your own email**.
2. Back in Supabase, open **SQL Editor** and run:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
   (swap in the email you registered with).
3. Go to `login.html` (labelled "Staff Login" in the nav) and log in — you'll
   be redirected straight to `admin.html`.

Repeat step 1–2 for each teammate who needs admin access.

> 🔒 Optional extra safety: once your whole team has set up their accounts,
> you can stop anyone else from ever finding `register.html` and signing up.
> In the Supabase dashboard go to **Authentication → Providers → Email** and
> turn off "Allow new users to sign up." (This only affects new sign-ups —
> your existing team accounts keep working.)

---

## 4. Running the site

This is a static HTML/CSS/JS site (no build step, no Node server needed) —
it just needs to be served over `http://` or `https://` (not opened directly
as a `file://` path, since some browsers block scripts on `file://`).

**Easiest options:**
- **VS Code Live Server** extension — right-click `index.html` → "Open with
  Live Server."
- **Python** (already installed on most computers):
  ```bash
  cd site-folder
  python3 -m http.server 8000
  ```
  then open `http://localhost:8000` in your browser.
- **Any static host** — Netlify, Vercel, GitHub Pages, or your university's
  own web hosting all work, since there's nothing to "build."

---

## 5. How the pieces fit together

```
Browser (any page)
   │
   ├─ assets/js/supabase-client.js   → loads the Supabase library, creates window.sb
   ├─ assets/js/store.js             → PGStore: one clean API the rest of the site calls
   │                                    (getProducts, checkout, summary, …)
   ├─ assets/js/ui.js                → icons, footer, toasts, money formatting
   └─ assets/js/admin.js             → renders the 5 tabs of the dashboard

Supabase (cloud)
   ├─ Postgres tables (products, inventory_items, orders, order_items, payments, …)
   ├─ Row Level Security             → customers can only see their own orders;
   │                                    admins can see/edit everything
   └─ record_sale() SQL function     → the ONE place that turns a cart into an
                                         order + payment + inventory deduction,
                                         used by BOTH the customer checkout and
                                         the admin "record a sale" button
```

Because `PGStore` hides all the Supabase calls behind simple functions like
`PGStore.getActiveProducts()`, you (or a future teammate) can keep building
new pages without needing to know SQL — just call the store.

**Important:** every `PGStore` function now returns a Promise, so pages use
`await`, e.g.:
```js
const products = await PGStore.getActiveProducts();
```

---

## 6. Using the site as a customer

1. Browse `products.html`, tap **Add to cart** on any flavour.
2. Tap the red **Cart** button (bottom-right) to review your order, adjust
   quantities with the +/− buttons.
3. Tap **Checkout**, fill in your name (email optional), tick the Terms &
   Conditions box, and tap **Pay now (simulated)**.
4. You'll see a receipt with an order number and reference — that's a real
   row in the `orders` table, and it already shows up in the admin
   dashboard.

No real payment details are ever asked for or stored — see `terms.html` for
the plain-language explanation.

---

## 7. Using the admin dashboard

Go to `admin.html` (after logging in as an admin — see section 3).

- **Overview** — revenue, profit, bags sold, this week's revenue chart, low
  stock alerts.
- **Products** — add/edit/hide flavours, set cost & selling price.
- **Inventory** — track ingredient stock, restock, edit minimum levels.
- **Sales** — a quick "walk-in sale" panel (for cash sales made in person,
  not through the website) plus a full history of every order.
- **Reports** — bags sold per flavour, profit breakdown, daily profit chart.
- **Pricing** *(new)* — the popcorn-machine cost model. Edit the machine's
  electricity/maintenance cost, trading days per month, etc., and it
  instantly recalculates the suggested price for every flavour. See
  section 8 below.

---

## 8. The cost-plus pricing model (now matches the Final Report)

The Final Report treats the popcorn machine purchase as a **one-time startup
cost** (R2,494.95 total — machine, utensils, and other equipment), not a
recurring per-batch charge. The Pricing tab now matches that exactly:

| Cost | How it's modelled |
|---|---|
| Popcorn machine + equipment | One-time, shown separately in its own "Startup equipment" card — **not** divided into the per-bag price |
| Electricity | Flat R150/month "cooking setup" cost, same figure the pot-based plan used |
| Ingredients (kernels, oil, sugar, salt, seasoning, bags) | Set per-flavour on the Products tab, unaffected by the pot→machine switch |
| Mobile data, transport, gloves | Monthly, same as the report |

All of these numbers live in the `business_settings` table and are editable
from the admin **Pricing** tab — nobody needs to touch code to update them
if, say, electricity prices go up. The suggested price table combines:

```
total cost per bag = ingredient cost (from the Products tab)
                    + indirect cost per bag
indirect cost per bag = (monthly electricity + data + transport + gloves) ÷ (bags made per month)
```

With the default settings (32 bags/batch, 1 batch/day, 22 trading days/month
= 704 bags/month, R310 in combined monthly overheads), that works out to
**R0.44/bag indirect cost** — matching the Final Report's Section 6 figures
exactly. If you change bags-per-batch, trading days, or any monthly cost in
the Pricing tab, this recalculates live.

---

## 9. Mobile / small-screen notes

The site was already responsive, and the new features follow the same
approach so everything stays usable on a phone:

- The **cart button** floats in the bottom-right corner, and the cart /
  checkout / receipt panels slide up from the bottom of the screen on
  narrow devices (they become centred pop-ups on wider screens).
- The **admin sidebar** collapses behind a hamburger button below 860px
  wide — tap it to open/close the menu.
- All new form fields (login, register, checkout) reuse the same big,
  thumb-friendly input styling as the rest of the site.
- Tables that don't fit on a small screen (Products, Inventory, Sales) sit
  inside a horizontally scrollable wrapper (`.table-wrap`) — swipe
  sideways to see extra columns instead of the layout breaking.
- Test on your phone by connecting it to the same Wi-Fi as your computer
  and visiting `http://<your-computer's-local-IP>:8000` (see section 4).

---

## 10. Functions & files you should know

| File | What it's for |
|---|---|
| `supabase-schema.sql` | The entire database — run this once in Supabase's SQL Editor. |
| `assets/js/supabase-client.js` | Connects the site to your Supabase project. |
| `assets/js/store.js` | `PGStore` — every database read/write goes through here. |
| `assets/js/admin.js` | Renders the admin dashboard's 5 tabs. |
| `assets/js/ui.js` | Icons, toasts, footer, money formatting — unchanged from before. |
| `terms.html` | Terms & Conditions page. |
| `Algorithm.md` | Beginner-friendly Big-O analysis of 5 core algorithms. |
| `INSTRUCTIONS.md` | This file! |

Handy `PGStore` functions to remember:
- `PGStore.getActiveProducts()` — products customers can see.
- `PGStore.checkout(items, customer)` — runs a simulated payment.
- `PGStore.summary()` — revenue/profit/bags/margin totals for Overview.
- `PGStore.isAdmin()` — check before showing admin-only UI.
- `PGStore.signUp(email, password, fullName)` / `signIn(email, password)` /
  `signOut()` — auth helpers.

---

## 11. Troubleshooting

- **"Payment could not be processed"** → almost always means the SQL schema
  hasn't been run yet, or the anon key in `supabase-client.js` doesn't match
  your project. Re-check section 2.
- **Products page is blank** → open your browser console (F12). If you see
  a CORS or network error, check that your Supabase project URL is correct
  and that you're online.
- **Logged in but admin dashboard says "Admins only"** → you haven't run the
  `update public.profiles set role = 'admin' ...` command yet (section 3),
  or you ran it with the wrong email.
- **Changes in Supabase don't show up** → most pages fetch fresh data on
  load; just refresh the page.
- **Admin dashboard is blank / tabs don't respond, especially with a VPN
  on** → every page now waits at most 8 seconds for Supabase to connect,
  then shows a red error box with a "Try again" button instead of hanging
  forever. If you see that box, the most common cause is a VPN or firewall
  blocking the connection — try turning the VPN off for that tab, or check
  your internet connection, then hit "Try again."

---

## 11b. Missing image

`flavour-cheese.png` wasn't part of the uploaded assets, so the "Cheesy Pop"
product will show a broken image until you add one. Drop a
`flavour-cheese.png` file into the `images/` folder (same size/style as the
other flavour photos), or change that product's image in the admin
**Products** tab to point at an existing photo in the meantime.

## 12. What's intentionally left simple

This is a beginner/intermediate student project, so a few things were kept
deliberately simple on purpose (not oversights):

- The cart lives in memory for the current visit only — it isn't saved if
  you close the tab. That's fine for a quick campus purchase flow.
- There's no real payment gateway integration — checkout is simulated, as
  required by the brief.
- Sorting/search algorithms use plain JavaScript loops (see `Algorithm.md`)
  rather than external libraries, since the data sizes involved are small.

Enjoy building on top of this — and good luck with the presentation! 🎉
