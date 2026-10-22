ROLE
You are a senior full-stack engineer. Build a complete, production-quality, mobile-first "Lucky Ticket Draw" game as a monorepo. The game uses virtual play-coins ONLY. Coins cannot be bought with real money and cannot be cashed out. Show "Play coins only, no real value" in the footer, wallet, and signup screen.

STACK (fixed, do not change)
- Monorepo: /server and /client (npm workspaces)
- Frontend: React 18 + Vite + TypeScript, React Router, TanStack Query, Tailwind CSS, Framer Motion for animations
- Backend: Node.js + Express + TypeScript, REST API under /api/v1
- Database: PostgreSQL + Drizzle ORM (drizzle-kit migrations)
- Auth: mobile number + password, JWT (access + refresh), bcrypt
- Validation: Zod on every endpoint
- Scheduler: node-cron for draw execution
- Security: helmet, CORS allowlist, express-rate-limit

GAME RULES
1. Three packages: 50, 100, 200 coins. Each package has its own draws, its own ticket pool, and its own prize. Prize is configurable per package (fixed amount or percent of pool). Package values come from the database, never hardcoded in the UI.
2. A user buys a ticket for a draw and gets exactly ONE ticket per draw (no quantity selector).
3. Ticket numbers are unique per draw, random 6-digit (100000-999999); max_tickets caps how many are sold. At purchase the user chooses:
   a) "Random Number": server assigns a free number, or
   b) "Pick Number": UI shows 10 free numbers; when one sells it is replaced by a new one. User picks one.
4. Each draw has a fixed draw_time. At that time the system announces the winning ticket number, credits the prize coins to the winner, and closes the draw. The next draw for that package opens automatically.
5. Draw mode is set per draw by admin: RANDOM (server CSPRNG) or ADMIN_SELECTED (admin picks the winning ticket before draw_time). The mode MUST be shown publicly on the draw screen as a badge: "Random draw" or "Admin-selected winner". Never hide it.
6. If no tickets sold, skip the draw and open the next. If tickets sold are below package min_tickets, cancel the draw and refund everyone.

DATABASE (Drizzle schema with indexes and constraints)
- users (id, mobile unique, name, password_hash, role user|admin, created_at)
- wallets (user_id PK/FK, balance bigint, updated_at), CHECK balance >= 0
- wallet_ledger (id, user_id, amount, type signup_bonus|daily_claim|ticket_purchase|prize|refund|admin_adjust, ref_id, balance_after, created_at)
- packages (id, name, price, prize_type fixed|pool_percent, prize_value, max_tickets, min_tickets, draw_interval_minutes, theme green|red|blue, is_active)
- draws (id, package_id, draw_time, status open|drawing|completed|cancelled, mode random|admin_selected, selected_ticket_no nullable, winning_ticket_no nullable, server_seed_hash, server_seed nullable until reveal, created_at)
- tickets (id, draw_id, user_id, ticket_no, created_at), UNIQUE(draw_id, ticket_no) and UNIQUE(draw_id, user_id)
- admin_audit_log (id, admin_id, action, draw_id, payload jsonb, ip, created_at)
- idempotency_keys (key, user_id, response jsonb, created_at)
Seed script: 3 packages (50 green, 100 red, 200 blue), 1 admin user, first open draw for each package.

CORE LOGIC
- Buy ticket: ONE DB transaction. Lock wallet row (SELECT ... FOR UPDATE), check balance, check draw is open and before cutoff, insert ticket, deduct coins, write ledger. Use unique constraints for races. Clean errors: 409 ticket taken, 409 already has ticket, 402 insufficient coins, 400 draw closed.
- Random assignment: pick from free numbers using crypto.randomInt, retry on conflict.
- Buy endpoint supports Idempotency-Key header.
- Draw job: runs every minute, idempotent (safe if run twice), transactional. Sets status=drawing, picks winner (RANDOM: derive from seed; ADMIN_SELECTED: selected_ticket_no, falling back to random if none was selected, and log that in audit), credits prize with ledger entry, reveals server_seed, sets completed, opens the next draw.
- Provably fair (RANDOM mode): when a draw opens, generate server_seed and publish its SHA-256 hash. After the draw, reveal the seed. Winner = HMAC-SHA256(server_seed, draw_id) mod number_of_sold_tickets, mapped to the sorted list of sold tickets. Add a Verify page where anyone can recompute the result.
- Admin can set selected_ticket_no and mode only before draw_time and only while draw is open. Every admin action goes to admin_audit_log.
- Signup gives a configurable starting coin bonus. Daily free claim (configurable amount, once per 24h).

API
Auth: POST /auth/register, /auth/login, /auth/refresh, GET /me
Game: GET /packages, GET /packages/:id/current-draw, GET /draws/:id (public info incl. mode, seed hash), GET /draws/:id/tickets (taken numbers), POST /draws/:id/buy {ticketNo?: number, random?: boolean}, GET /me/tickets, GET /me/wallet, POST /me/daily-claim, GET /results (filter by package, date), GET /draws/:id/verify
Admin (role-guarded): GET/POST/PATCH /admin/packages, GET /admin/draws, POST /admin/draws/:id/mode, POST /admin/draws/:id/select-winner, POST /admin/users/:id/adjust-coins, GET /admin/users, GET /admin/audit-log

UI REFERENCE
The attached image is a 14-screen mobile mockup. It is a style and layout reference only. Follow its layout, gradients, card shapes, crown/trophy badges, rounded buttons, and bottom tab bar (Home, Tickets, Results, Wallet, More) closely. Extract design tokens (colors, radii, shadows, fonts) into a theme file first.

MANDATORY CHANGES TO THE REFERENCE
- Currency is virtual coins. Replace every ₹ with a coin icon. No real-money flows.
- Do NOT build: Payment screen, UPI/Card/Net Banking, Add Money, Deposit, Withdraw.
- Do NOT use "Kolkata Lottery" name, logo, or "Official Lottery App" text. Use APP_NAME from a config constant and a generic logo slot.
- Only 3 packages: 50 (green theme), 100 (red theme), 200 (blue theme). Skip the purple and pink screens.
- Book Ticket screen: keep the number grid and "Random Number" button, remove quantity selector, primary button "Confirm" (deducts coins).
- Wallet screen: coin balance, daily free claim button, winnings, bonus, recent transactions from wallet_ledger.
- Profile: My Tickets, My Results, My Wallet, Help, Settings, Logout. Remove Refer & Earn.
- Show the draw mode badge on every draw screen.

SCREENS
Splash, Login/Register, Home (package cards + live countdown), Package Select, Draw screen (themed per package, prize, countdown, mode badge, seed hash), Book Ticket, My Tickets, Wallet, Results (package filter, date picker), Verify, Profile/Menu, Admin panel (packages, draws, mode toggle, winner select, users and coin adjust, audit log; reuse the same style).
Extras: live countdown, winner announcement (polling every few seconds), celebration animation for winners, toasts, loading and error states, max width 430px centered on desktop.

DELIVERABLES
1. Folder structure
2. Drizzle schema, migration, seed script
3. Complete backend (routes, services, middleware, cron job)
4. Complete frontend
5. .env.example and README (setup, migrate, seed, run, default admin login)
6. Tests: buy transaction race condition, draw job idempotency, provably-fair verification

OUTPUT RULES
Write complete runnable code, file by file, with the path above each file. No skipped files, no TODO placeholders. If something is ambiguous, pick a sensible default and list it in the README. End with a checklist confirming every rule above is implemented.