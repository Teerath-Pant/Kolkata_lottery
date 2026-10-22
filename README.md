# Lucky Ticket Draw

Mobile-first ticket-draw game played with **virtual play-coins only**. Coins cannot be bought with real money and cannot be cashed out ("Play coins only, no real value" is shown in the footer, wallet and signup screen).

Stack: React 18 + Vite + TS + Tailwind + TanStack Query + Framer Motion / Express + TS + PostgreSQL + Drizzle / Zod / JWT / node-cron.

## Structure

```
server/
  drizzle/                 generated SQL migration (drizzle-kit)
  src/config.ts            env (zod-validated)
  src/db/{schema,index,migrate,seed}.ts
  src/lib/{fair,auth,errors}.ts     provably-fair maths, JWT, AppError
  src/middleware/index.ts           auth, admin guard, error handler
  src/services/{wallet,buy,draws,drawJob,admin,account}.ts
  src/routes/{auth,game,admin}.ts   /api/v1/*
  src/{app,index}.ts                express app, cron start
  tests/                            vitest (buy race, draw idempotency, provably fair, HTTP API)
user/                      player app (mobile-first, 430px frame)
  src/theme.ts             design tokens (colours, radii, shadows, font, per-package gradients)
  src/config.ts            APP_NAME + coin note
  src/pages/*              Splash, Auth, Home, Packages, Draw, Book, Tickets, Wallet, Results, Verify, More, Info
  src/components/*         Layout (tab bar), ui, Toast, Celebration, PackageCard
admin/                     separate admin panel app (own login, admin role only)
  src/pages/*              Login, Dashboard, Draws (mode + winner), Packages, Users (coin adjust), Winners
```

## Setup

Requires Node 20+ and PostgreSQL 14+.

```bash
cp .env.example .env            # set DATABASE_URL and the JWT secrets
createdb lucky_draw             # or any empty database matching DATABASE_URL
npm install
npm run migrate                 # applies server/drizzle/*.sql
npm run seed                    # 3 packages, admin user, first open draw per package
npm run dev                     # API :4000 + user app :5173 + admin panel :5174 (Vite proxies /api)
```

| What | URL |
|---|---|
| Player app (`user/`) | http://localhost:5173 |
| Admin panel (`admin/`) | http://localhost:5174 |
| API server (`server/`) | http://localhost:4000/api/v1/health |

In the combined `npm run dev` output every line is prefixed with `[dev:server]`, `[dev:user]` or `[dev:admin]`, and each prints a labelled URL.

**Default admin login:** mobile `9999999999`, password `Admin@12345` (from `ADMIN_MOBILE` / `ADMIN_PASSWORD` in `.env`; change before deploying). Log in at the admin panel (http://localhost:5174). It is a separate app; non-admin accounts are rejected.

After changing `server/src/db/schema.ts`: `npm run generate` then `npm run migrate`.

Production: `npm run build`, then `npm run migrate && npm start -w server`. If `user/dist` / `admin/dist` exist the API serves the player app at `/` and the admin panel at `/admin/`.

## UI notes

- **Animations (Framer Motion) on every page, in both apps:** route transitions and staggered entrance of cards/tiles/rows, spring tap/hover on buttons and tiles, sliding tab indicators (bottom tab bar, filters, admin nav), count-up balances, animated toasts, expand/collapse panels, number-grid selection, winner pop-in and confetti celebration. `MotionConfig reducedMotion="user"` turns motion down for users who set "reduce motion" in their OS; the player Settings page also has a "Reduce celebration effects" switch.
- **Responsive:** phones (<768px) get the mockup layout with the bottom tab bar, tuned down to 320px (fluid text, safe-area padding, `100dvh`). Tablets/desktops (≥768px) use the full screen: top navigation bar, split-screen login (brand panel + form), 4-column home cards, 2-column Draw/Book/Wallet/lists, sticky booking summary. The admin panel is fluid too: 1 column on phones, 2-3 column grids on larger screens. (The original brief said max 430px on desktop; this was changed on request.)

## Tests

```bash
npm test
```

Row locks and unique constraints are what is being tested, so tests run against real Postgres. With no `TEST_DATABASE_URL`, a throw-away embedded Postgres is started on port 54329 automatically. Set `TEST_DATABASE_URL` to use your own (its tables get truncated).

Covered: buy transaction races (20 users, same number; one user x10 parallel; 30 random buyers), insufficient coins / closed draw / idempotency key, draw job idempotency (concurrent + repeated runs, refunds, no-ticket skip, admin-selected, fallback + audit), seed-hash commitment and independent winner recomputation, and the HTTP API end to end.

## How it works

- **Package values live in the DB** and are snapshotted onto each draw when it opens (price, prize rule, max/min tickets). Editing a package affects the *next* draw only.
- **Buy** is one transaction: lock draw row (shared) → lock wallet row (`FOR UPDATE`) → idempotency lookup → check open + before cutoff → insert ticket (unique constraint on draw + number decides races, `ON CONFLICT DO NOTHING`) → deduct coins → ledger. A user can hold any number of tickets in a draw (one per buy call, limited by coins and `max_tickets`). Errors: 409 `TICKET_TAKEN`, 402 `INSUFFICIENT_COINS`, 400 `DRAW_CLOSED`. Random numbers use `crypto.randomInt` over free numbers and retry on conflict.
- **Draw job** (`node-cron`, every minute and once at startup): for each due open draw, one transaction does `UPDATE … SET status='drawing' WHERE status='open'`; only one runner can match, so double runs are no-ops. It picks the winner, credits the prize, reveals the seed, completes the draw and opens the next one (a partial unique index allows only one open draw per package). Lock order is draw → wallet in both buy and job, so they cannot deadlock.
- **Provably fair**: on open, the server generates `server_seed` and publishes `SHA-256(seed)`. Winner = `sortedSoldTickets[ HMAC_SHA256(key = seed, msg = String(draw_id)) mod soldCount ]`. The seed is never returned by the API until the draw finishes. The Verify page recomputes everything in the browser with WebCrypto.
- **Admin-selected** draws are labelled publicly with the badge "Admin-selected winner" everywhere a draw is shown; random draws show "Random draw". The selected ticket is never exposed publicly before the draw. Admin can change mode/winner only while the draw is `open` and before `draw_time`. If the selected ticket is unsold or none was chosen, the winner falls back to the seed-derived random pick and a `draw_fallback_random` audit row is written. Every admin action is in `admin_audit_log`.
- Wallet changes all go through one function (`applyWallet`) that locks the row, checks `balance >= 0` (plus the DB CHECK) and writes `wallet_ledger` with `balance_after`.

## Defaults I chose (ambiguities)

| Topic | Default |
|---|---|
| Signup bonus / buy cutoff | 500 coins / 30 s before draw time (`SIGNUP_BONUS`, `BUY_CUTOFF_SECONDS`) |
| Seed packages | Green 50 (fixed prize 2000), Red 100 (80% of pool), Blue 200 (fixed 10000); 100 tickets each, min 5/5/3, a draw every 30 min |
| Ticket numbers | random 6-digit (100000–999999); `max_tickets` (≤ 9999) caps how many are sold. Pick grid shows 10 free numbers from a stable per-draw sequence (sha256 of the public seed hash); a sold number is replaced in the same slot |
| Draw with no tickets | status `cancelled` (nothing to refund), next draw opens |
| Draw schedule | per package, one of: repeat every N minutes (`draw_interval_minutes`) or once a day at a fixed time (`daily_time`, `HH:MM`, Indian Standard Time = UTC+5:30). The Admin form disables the one you don't pick; a DB check enforces exactly one. Changes apply to the next draw that opens |
| Minimum tickets | none: a draw with even one sold ticket runs and that ticket wins. A draw with no tickets is skipped (status `cancelled`, nothing to refund) |
| Extra draw columns | `ticket_price, prize_type, prize_value, max_tickets` (snapshot), `winner_user_id, prize_amount, win_method, completed_at`; `admin_audit_log.admin_id` is nullable for system actions |
| Idempotency keys | scoped per user (primary key `(user_id, key)`) |
| Passwords | `bcryptjs` (same bcrypt algorithm, pure JS, no native build on Windows). Every password gets its own random salt, stored inside the hash; cost 12 (`BCRYPT_ROUNDS`). Plaintext is never stored or logged |
| Mobile format | exactly 10 digits |
| Tokens | access 15 min, refresh 30 days, stateless JWTs. Browser apps get them as `HttpOnly; SameSite=Lax` cookies (`Secure` in production, so serve over HTTPS); JS never sees them and the client refreshes on 401. The refresh cookie is only sent to `/api/v1/auth/*`. Player and admin apps use separate cookie pairs (`at`/`rt`, `admin_at`/`admin_rt`), picked by the `X-Client: user\|admin` header, which cookie-authenticated writes must also send (CSRF guard). API clients without `X-Client` get the tokens in the JSON body and use `Authorization: Bearer`. `POST /auth/logout` clears the cookies |
| Results date filter | calendar day in UTC |
| Winner names | masked in public results (`A***`) |
| Rate limits | 300 req/min per IP on the API, 30 login/register attempts per 15 min per IP |
| Logo | generic emoji slot, replace the marked blocks; the name comes from `user/src/config.ts` (`APP_NAME`) |
| Skipped by design | Payment, UPI/card/net banking, Add Money, Deposit, Withdraw, Refer & Earn, purple/pink screens |
