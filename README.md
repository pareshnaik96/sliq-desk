# SliqDesk

A multi-tenant support desk. Organizations have members with roles, tickets
follow a status workflow and carry comments, updates arrive live over
Socket.IO, and a background worker flags high/urgent tickets that nobody on
staff has answered in time.

**Stack:** Node 20 · Express 5 · MongoDB 7 (single-node replica set) · Mongoose ·
Zod · Socket.IO · argon2 · JWT · helmet · pino | React 18 + Vite · React Router 7 ·
TanStack Query · socket.io-client | Vitest · supertest · mongodb-memory-server.

> **Language:** the brief specified TypeScript. At the product owner's request,
> both packages use modern JavaScript (ES modules) instead. Strict Zod schemas
> check every input boundary at runtime. See [Implementation status](#implementation-status).

---

## Setup

### Run

```bash
docker compose up --build
```

Open **http://localhost:8080**. A fresh clone works with no edits and no
`.env` file, because compose carries working defaults. To override a value,
copy `.env.example` (keys only) to `.env` and fill in the values you want; empty
values fall back to the defaults in `docker-compose.yml`.

| Service | URL | Notes |
| ------- | --- | ----- |
| web (nginx + built SPA) | http://localhost:8080 | Proxies `/api/*` and `/socket.io/*` to the API, so the browser sees one origin |
| api | http://localhost:4000 | e.g. `curl localhost:4000/health` |
| mongo | `mongodb://localhost:27018/sliqdesk?directConnection=true` | For Compass/mongosh; bound to localhost only. `--replSet rs0`; its healthcheck runs `rs.initiate` on first boot |

On startup the api container runs `node src/seed.js`, then the server. The seed
only writes when the database is empty. To reset all data, run
`docker compose down -v` and then `docker compose up`.

### Seeded logins

**Every seeded account uses the password `sliqdesk-dev`.**

| Organization | Admin | Agent | Viewer |
| ------------ | ----- | ----- | ------ |
| Acme Support | `admin@acme.test` | `agent@acme.test` | `viewer@acme.test` |
| Globex Help Desk | `admin@globex.test` | `agent@globex.test` | `viewer@globex.test` |

Each organization gets the same five tickets:

| # | Ticket | Status | Priority | Assignee |
| - | ------ | ------ | -------- | -------- |
| 1 | Cannot log in after password reset | in progress | high (agent has replied) | agent |
| 2 | Invoice PDF shows the wrong VAT rate | open | medium | unassigned |
| 3 | Checkout page returns 500 for some customers | open | urgent, **no reply** | unassigned |
| 4 | Add CSV export to the reports page | resolved | low | admin |
| 5 | Typo on the pricing page | closed | low | unassigned |

Ticket 3 has no staff reply yet, so it breaches its SLA about 2 minutes after
the first start.

### Trigger an SLA alert

1. Sign in as **`agent@acme.test`** (password `sliqdesk-dev`).
2. Click **New ticket**, set priority to **urgent**, and create it.
3. **Don't comment on it.** Keep the tab open.
4. Wait about **`SLA_MINUTES`** (2 by default) plus up to `SLA_POLL_SECONDS`
   (10). A toast reads "Ticket #N breached its SLA", and the list row gets an
   **SLA breached** badge. Anyone else in the org who's signed in sees the
   toast too.

A staff comment before the deadline stops the clock. Lowering the ticket to
low or medium cancels the deadline.

### Tests

```bash
cd api && npm install && npm test     # ~160 tests, in-memory MongoDB replica set
cd web && npm install && npm test     # UI permission-mirror unit tests
```

The first API run downloads a MongoDB 7 binary (about 600 MB) and caches it.
You don't need Docker or a running database for it.

### Lint

```bash
cd api && npm run lint    # ESLint + prettier --check
cd web && npm run lint
```

### Local development (optional)

```bash
docker compose up -d                   # API on :4000 + Mongo
cd web && npm run dev                  # Vite on :5173 (reloads the page on save); proxies /api and /socket.io to :4000
```

---

## Architecture

```
 Browser ── React SPA (React Query cache, socket.io-client)
    │  one origin: /api/*  and  /socket.io/*   (httpOnly session cookie)
    ▼
 ┌──────────────────────── web container: nginx ────────────────────────┐
 │  serves the built SPA · proxies /api → api:4000 · /socket.io (WS)     │
 └──────────────────────────────────┬────────────────────────────────────┘
                                    ▼
 ┌──────────────────────── api container: Node 20 ───────────────────────┐
 │                                                                        │
 │  Express: helmet → CORS allowlist → json(100kb) → rate limit (auth)    │
 │     routes ─► validate (Zod .strict) ─► authenticate                   │
 │                                         (JWT → load user from DB →     │
 │                                          TenantContext{orgId,userId,   │
 │                                          role})                        │
 │     services ─► policies.can() + workflow rules                       │
 │        │                                                               │
 │        ├─► repositories ── every filter/insert gets {orgId} ──┐        │
 │        │                                                      │        │
 │        └─► event bus (in-process) ── after the write succeeds │        │
 │                 │                                             │        │
 │  Socket.IO ◄────┘  io.to("org:{orgId}").emit(...)             │        │
 │   handshake: cookie → DB user → join org:{orgId}, user:{id}   │        │
 │                                                               │        │
 │  SLA worker (every SLA_POLL_SECONDS) ── atomic claim ─────────┤        │
 │        └─► event bus: ticket.overdue                          │        │
 └───────────────────────────────────────────────────────────────┼────────┘
                                                                 ▼
                                   MongoDB 7, single-node replica set rs0
                    organizations · users · tickets · comments · counters
```

Each request takes one path. The **route** validates the input. **authenticate**
rebuilds the tenant context from the database. The **service** applies the
permission and workflow rules. A **repository** does the scoped read or write.
Only after that write succeeds does the service **publish** an event. The
realtime layer forwards it to the org's Socket.IO room, and the browser
patches or invalidates its React Query cache.

The SLA worker runs inside the API process, but it only talks to MongoDB. Every
instance can run it safely, and it publishes through the same event bus.

```
api/src/
  app.js · server.js · index.js · seed.js    app, wiring, entry points
  config.js                                  env → validated config (fails fast)
  models/          Mongoose schemas + indexes           ← persistence only
  repositories/    the only code that may import mongoose/models (ESLint-enforced)
  policies/        pure can(actor, action, resource)
  domain/          enums, status transition table
  services/        business rules; publish events after writes
  routes/ middleware/ validation/            HTTP edge
  events/bus.js · realtime/socket.js · jobs/sla.worker.js · db/
api/test/          Vitest suites
web/src/           pages, api client + React Query hooks, realtime hook, permission mirror
```

---

## Key decisions and trade-offs

### Tenant isolation: shared collections plus a repository layer

All tenants share the same collections, and every document carries `orgId`.
The alternatives were a database or a collection per tenant.

- **Where `orgId` comes from:** the authenticated user's DB record, never the
  client. `authenticate` loads the user on every request and freezes a
  `TenantContext`. The JWT carries only `sub`.
- **Repositories:** every repository function takes that context. `scope(ctx,
  filter)` spreads the caller's filter first and sets `orgId` last, so it can't
  be overridden. `stamp(ctx, doc)` does the same for inserts.
- **Enforcement:** an ESLint `no-restricted-imports` rule forbids `mongoose` and
  `models/` everywhere except `repositories/`, `models/` and `db/`, and a test
  (`lint-guard.test.js`) proves the rule fires.
- **Unscoped exceptions:** only three, all explicit, because each one is what
  establishes or replaces a tenant context. They are the login lookup, signup
  (`auth.repo.js`), and the SLA claim (`sla.repo.js`), which routes each alert
  by the ticket's own `orgId`.
- **Input defence:** every Zod schema is `.strict()`, so unknown keys (like
  `orgId`) and operator objects (`{"$ne":null}`, `?status[$ne]=`) fail with
  400. Route ids must be ObjectIds.
- **Another org's ids return 404**, never 403. An assignee from another org
  gets the same `INVALID_ASSIGNEE` error as a nonexistent user, so nothing
  confirms that it exists.
- **Trade-offs:** this is the cheapest model to run and migrate, and it shards
  naturally on `orgId` later. The cost is that isolation is enforced in code,
  not by the database. One unscoped query would leak data, which is why the
  repository layer, the lint rule and the per-endpoint isolation tests all
  exist. Per-tenant backup/restore and noisy-neighbour isolation are harder
  than with a database per tenant.

### Data model

| Collection | Notes |
| ---------- | ----- |
| `organizations` | `name`, `slaMinutes` (copied from `SLA_MINUTES` at signup), `membershipVersion` (used only to serialize membership changes) |
| `users` | `orgId`, globally unique lowercase `email`, `role`, `status: active\|removed` (soft delete keeps history) |
| `tickets` | per-org `number`; `assigneeId\|null`; SLA fields `slaDueAt`, `firstStaffResponseAt`, `overdue`, `overdueAt` |
| `comments` | `orgId`, `ticketId`, `authorId`, `authorRole` (role at the time of writing) |
| `counters` | `{ _id: "ticket:<orgId>", seq }`, incremented with an atomic `$inc` + upsert |

Indexes: `users {email}` (unique) and `{orgId, role}`. `tickets {orgId, status,
priority, assigneeId, createdAt:-1}`, `{orgId, number}` (unique), `{orgId,
createdAt:-1, _id:-1}` for unfiltered keyset paging, and a **partial**
`{slaDueAt}` index where `overdue:false, firstStaffResponseAt:null`. `comments
{orgId, ticketId, createdAt}`. Every compound index starts with `orgId`.

Trade-offs:

- Comments live in their own collection rather than embedded in tickets, so
  ticket documents stay small and comment history is unbounded.
- The ticket counter runs outside a transaction to avoid write conflicts on a
  hot document. A failed insert can therefore leave a gap in ticket numbers.
- Last-admin protection runs in a transaction that first bumps
  `membershipVersion`. Two admins demoting each other at the same moment then
  write-conflict, and the retry re-counts the admins. Plain snapshot
  isolation would let both demotions succeed (write skew).

### Workflow and concurrency

```
open → in_progress | resolved | closed      in_progress → open | resolved | closed
resolved → in_progress | closed             closed → terminal (no edits, assignment or comments)
```

Writes use `findOneAndUpdate({ _id, orgId, status: <seen>, assigneeId: <seen> })`,
and a null result returns **409**. The assignee is in the filter because it
drives the agent permission check. Without it, an agent could pass the check
on an unassigned ticket just as someone else assigned it.

Errors: 400 validation · 401 unauthenticated · 403 permission · 404 missing or
other tenant · 409 concurrent change, duplicate email, or last admin · 422
invalid transition or closed ticket. The body is always
`{ error: { code, message, details? } }`.

### Auth

- Signup creates the org and its first admin in **one transaction**.
- Passwords use **argon2id**. Login returns the same error for an unknown email
  and a wrong password, and runs a dummy hash for unknown emails so timing
  doesn't reveal which accounts exist.
- The session is a **15-minute HS256 JWT** in an `httpOnly`, `SameSite=Strict`
  cookie, `Secure` when `NODE_ENV=production`. Logout clears the cookie.
- **Sliding renewal:** when less than half the lifetime remains, the next
  request gets a fresh token. This keeps active users signed in at the price of
  a less fixed maximum session length.
- **Role and status are re-read from the DB on every request and socket
  handshake.** Demotions and removals apply to the very next request, and the
  server disconnects that user's sockets. The cost is one indexed `_id` lookup
  per request.
- Signup and login share one per-IP rate limiter (in-memory).
- SameSite=Strict plus a JSON-only API is the CSRF defence. There are no CSRF
  tokens.

**Permissions** (`api/src/policies`, pure and unit-tested; `requireRole` gates
routes coarsely):

| Action | admin | agent | viewer |
| ------ | :---: | :---: | :----: |
| View tickets, comments, members | ✅ | ✅ | ✅ |
| Create tickets, add comments | ✅ | ✅ | ❌ |
| Update status / priority / title / description | any ticket | unassigned or assigned to them | ❌ |
| Change assignee | any admin/agent | only to themselves, or unassign | ❌ |
| Manage members | ✅ | ❌ | ❌ |

### Real-time

- Services publish to an in-process event bus **after** the write succeeds. The
  Socket.IO layer forwards each event to `org:{orgId}`.
- The handshake is authenticated from the cookie, and the server picks the
  rooms. The server registers no client-to-server events, so a client can't
  join a room. `Origin` is checked against the CORS allowlist, because CORS
  doesn't cover WebSocket upgrades.
- Payloads carry ids and changed fields only: `ticket.created {ticketId,
  number}`, `ticket.updated {ticketId, number, changes}`, `comment.created
  {ticketId, commentId, authorId}`, `ticket.overdue {ticketId, number,
  priority, slaDueAt, overdueAt}`, `member.changed {memberId, change, role?}`.
- The client patches the ticket cache in place and invalidates lists,
  comments, members and `me`. When the server drops a socket because of a
  membership change, the client re-checks `/auth/me`. It then reconnects with
  the new role or drops to the login screen.
- **Trade-offs:** emitting in-process after the write is simple and correct for
  one instance. But delivery is best-effort: if the process crashes between
  the write and the emit, the event is lost (clients recover on reconnect,
  refetch or focus). Sockets authenticate only at the handshake. Membership
  changes force a reconnect, but an idle socket isn't otherwise re-checked
  when its JWT expires.

### Background processing (SLA)

- **When the clock starts:** a ticket created as, or raised to, high/urgent
  gets `slaDueAt = now + org.slaMinutes`, unless staff already responded.
  Lowering the priority before a breach clears the deadline.
- **When it stops:** the first admin/agent comment sets `firstStaffResponseAt`
  in the same transaction as the comment insert.
- **The worker:** `jobs/sla.worker.js` polls every `SLA_POLL_SECONDS`. Each poll
  repeatedly runs `findOneAndUpdate({ slaDueAt ≤ now, overdue:false,
  firstStaffResponseAt:null, status ∈ [open, in_progress] }, { $set: {
  overdue:true, overdueAt:now } })` until nothing matches, and publishes
  `ticket.overdue` for each claimed ticket.
- **Why poll MongoDB:** the deadline lives in the database, so it survives
  restarts. The claim and the flag flip are one atomic operation, so several
  instances never alert twice, and there's no lock or leader election to
  manage. The cost is up to one poll interval of alert latency, plus one cheap
  indexed query per instance per interval. A delayed-job queue (BullMQ, Agenda)
  would be more precise, but it's another moving part.

### Dependencies

Both packages use only the assignment's stack, plus `react-dom` (React can't
render in a browser without it). Small pieces of plain code replace the usual
helpers:

- **Cookie parsing:** a short loop in `api/src/auth/cookies.js`.
- **Request logging:** one middleware in `app.js` that logs a pino line per
  request.
- **ESLint:** core rules only. The web config carries a 10-line local rule so
  components used only as JSX tags count as "used".
- **No React Fast Refresh plugin:** `npm run dev` reloads the page on save
  instead of hot-swapping components.

---

## API

The SPA calls these routes under `/api/*` through nginx. Every body, query and
param is validated with strict Zod schemas.

| Method | Path | Who | Body / query | Success |
| ------ | ---- | --- | ------------ | ------- |
| GET | `/health` | public | | `200 {status, db}`, or `503` if the DB is down |
| POST | `/auth/signup` | public, rate limited | `{orgName, name, email, password (8+ chars)}` | `201 {user, org}` + cookie |
| POST | `/auth/login` | public, rate limited | `{email, password}` | `200 {user, org}` + cookie |
| POST | `/auth/logout` | any | | `204`, cookie cleared |
| GET | `/auth/me` | signed in | | `200 {user, org}` |
| GET | `/members` | all roles | | `200 {items}` (active members) |
| POST | `/members` | admin | `{email, name, role}` | `201 {member, temporaryPassword}` |
| PATCH | `/members/:id` | admin | `{role}` | `200 member` · `409 LAST_ADMIN` |
| DELETE | `/members/:id` | admin | | `204` · `409 LAST_ADMIN` |
| GET | `/tickets` | all roles | `status, priority, assignee=me\|unassigned\|<id>, cursor, limit` (default 20, max 100) | `200 {items, nextCursor}` |
| POST | `/tickets` | admin, agent | `{title, description?, priority?, assigneeId?}` | `201 ticket` |
| GET | `/tickets/:id` | all roles | | `200 ticket` |
| PATCH | `/tickets/:id` | admin, agent (policy-checked) | any of `{title, description, status, priority, assigneeId\|null}` | `200 ticket` |
| GET | `/tickets/:id/comments` | all roles | | `200 {items}`, oldest first |
| POST | `/tickets/:id/comments` | admin, agent | `{body}` | `201 comment` |

Paging is keyset-based on `(createdAt desc, _id desc)`. Send `nextCursor` back
as `cursor`; it's `null` on the last page.

---

## Implementation status

"Done" means I ran and verified it. The last column says how:

- **unit / integration:** the Vitest suite in `/api`.
- **browser:** a scripted headless-browser walkthrough (15 checks) run against a
  fresh compose stack. The script lives outside the repo, because Playwright
  isn't an approved dependency.
- **live:** observed manually against the running compose stack with curl or a
  socket script.

| Requirement | Status | Verified by / notes |
| ----------- | ------ | ------------------- |
| **Stack** | | |
| Node 20, Express, Mongoose, Zod, Socket.IO, argon2, jsonwebtoken, helmet, cors, express-rate-limit, pino | Done | api image runs on `node:20`; all are used |
| TypeScript in both packages | **Not done (changed by request)** | The product owner asked for plain modern JS (ESM). To finish: add `tsconfig` + `tsc --noEmit` with `checkJs` as a first step, then rename files to `.ts`/`.tsx`. The layering (repositories, services, policies) carries over unchanged. |
| MongoDB 7 single-node replica set (transactions) | Done | live: compose healthcheck initiates `rs0`; signup/comment transactions run |
| React + Vite, React Router, TanStack Query, socket.io-client | Done | browser. Uses React Router 7 because 6.x has open advisories. |
| Vitest + mongodb-memory-server (replica set) + supertest | Done | `npm test` in `/api` |
| ESLint + Prettier in both packages | Done | `npm run lint` passes in both |
| Repo layout `/api`, `/web`, compose, `.env.example`, README | Done | |
| **Domain and data model** | | |
| Collections and fields as specified | Done | integration tests |
| Indexes as specified (orgId-first compound, partial SLA index) | Done | created at startup; a test asserts the SLA claim query uses `slaDueAt_1` |
| Per-org sequential numbers via atomic `$inc` | Done | integration: 10 concurrent creates get unique numbers; numbering is per org |
| **Tenant isolation** | | |
| orgId only from the DB user, never from body/query/params | Done | integration: smuggled `orgId` → 400 on tickets, members, signup and query string |
| Repositories take a TenantContext and scope every filter and insert | Done | code review + isolation suite |
| ESLint rule forbidding models outside repositories | Done | `lint-guard.test.js` |
| Other org's resource → 404 | Done | `tenant-isolation.test.js`: every ticket/comment/member endpoint, for admin, agent and viewer |
| Assignee must be same org, admin or agent | Done | integration: other org, viewer and unknown id → 400 `INVALID_ASSIGNEE` |
| Socket rooms chosen server-side | Done | integration: emitting `join` for another org's room has no effect |
| **Auth** | | |
| Signup creates org + admin in one transaction | Done | integration, including rollback when the admin insert fails |
| Login / logout / me | Done | integration + browser |
| 15-min JWT, httpOnly, SameSite=Strict, Secure in production | Done | integration asserts the flags; live: cookie observed through nginx |
| Secure cookie in the shipped compose stack | **Partial** | Compose sets `COOKIE_SECURE=false` because the demo is plain `http://localhost`, which Safari won't accept Secure cookies on. Without the override, `NODE_ENV=production` sets Secure (tested). To finish: put TLS in front of nginx and drop the override. |
| Role and status loaded from DB on every request | Done | integration: demotion and removal apply on the same cookie's next request |
| Admin adds members with a one-time temporary password | Done | integration + browser (new member logs in with it) |
| Last-admin protection | Done | integration, including concurrent mutual demotion; browser shows the error |
| Disconnect sockets on removal / role change | Done | integration (`io server disconnect`); browser: demoted user's UI switches to viewer live |
| Rate limit login and signup | Done | integration (login → 429); live: signup → 429 after 20. The two routes share one counter, held in memory per instance. |
| **Permissions** | | |
| `can()` in a pure `/policies` module + `requireRole` | Done | `policy-matrix.test.js`: 3 roles × every action × every ticket situation / assign target |
| Rules as specified (incl. agent self-assign only) | Done | unit + integration + browser |
| **Workflow** | | |
| Transition table, closed terminal | Done | `workflow.test.js` (all 16 pairs); integration: closed rejects edits, assignment and comments |
| Atomic conditional update, 409 / 422 / 403 / 400 mapping | Done | integration: a stale-snapshot test gives 409; each code asserted |
| **API** | | |
| All endpoints | Done | integration + browser |
| Keyset pagination (default 20, max 100, `nextCursor`) | Done | integration: 25 tickets over 3 pages with no gaps or duplicates; bad cursor → 400; browser "Load more" |
| Error shape `{error:{code,message,details?}}` | Done | integration |
| Zod `.strict()`, rejects unknown keys and operator objects | Done | integration: `{"$ne":null}` in body and query, extra keys, malformed JSON |
| helmet, CORS allowlist from env, body size limit | Done | live: helmet headers present; foreign origin gets no `Access-Control-Allow-Origin`; integration: 413 on an oversized body |
| openapi.yaml **or** endpoint table | Done (table) | [API](#api). No `openapi.yaml`. |
| **Real-time** | | |
| Cookie-authenticated handshake, `org:{orgId}` room | Done | integration: no or forged cookie rejected; foreign Origin rejected |
| Events: ticket.created / updated / overdue, comment.created, member.changed | Done | integration for each; browser for updated, comment, overdue and member change |
| Emit only after a successful write, via an in-process bus | Done | integration: a failed (422) update emits nothing |
| Frontend patches / invalidates React Query on events | Done | browser: admin's open ticket shows the agent's status change and comment without reload |
| Redis adapter behind `REDIS_URL` (optional) | **Not done** | Skipped to prioritise isolation and correctness. Without it, multiple API instances only reach their own sockets. To finish: add `@socket.io/redis-adapter` + `redis` when `REDIS_URL` is set (about 15 lines in `realtime/socket.js`), a `redis` compose service, and a two-instance test. |
| **SLA** | | |
| `slaDueAt` on create / raise to high or urgent | Done | integration (create, raise, lower clears) |
| First staff comment sets `firstStaffResponseAt` | Done | integration: set once, not overwritten |
| Worker claims atomically, emits `ticket.overdue`, restart- and multi-instance-safe | Done | integration: claimed once; skips answered, resolved/closed, low/medium; 3 concurrent workers → no duplicates; live: alert 124 s after creation with `SLA_MINUTES=2` |
| `SLA_MINUTES=2`, `SLA_POLL_SECONDS=10` defaults | Done | Set as defaults in `docker-compose.yml`; `.env.example` lists the keys |
| **Frontend** | | |
| Signup, Login | Done | browser |
| Ticket list: status/priority/assignee filters, Load more, overdue badge | Done | browser |
| Ticket detail: fields, role-aware edit controls, allowed transitions only, comments, live updates | Done | browser: viewer and agent read-only cases, transition options for in_progress/resolved/closed, live status and comment |
| Members (admin only): list, add with role, change role, remove | Done | browser; the viewer can't see the nav link, and `/members` redirects |
| Overdue toast | Done | browser: toast for the new ticket 127 s after creation |
| UI hides controls but server stays authoritative | Done | every rule is enforced and tested server-side; the UI mirror has unit tests |
| **Seed data** | | |
| Idempotent seed on api startup when the DB is empty: 2 orgs × admin/agent/viewer, varied tickets incl. unassigned and agent-assigned | Done | `seed.test.js`; live: fresh `compose up` seeds, restart logs "Seed skipped" |
| **Docker / config** | | |
| mongo with `--replSet rs0` + healthcheck running `rs.initiate` | Done | live |
| api depends on healthy mongo, runs seed then server | Done | live |
| web served by nginx | Done | live + browser |
| Optional redis service | **Not done** | Goes with the Redis adapter above |
| `.env.example` with working defaults, no real secrets; fresh clone + `docker compose up` works | Partial (by choice) | `.env.example` lists keys only, at the author's request; the working dev defaults live in `docker-compose.yml`, so a fresh clone still runs with zero edits. To match the brief literally, put the values back into `.env.example`. Verified: live: `docker compose down -v && up` from the committed tree. `CORS_ORIGIN` is accepted as an alias of `CORS_ORIGINS`. |
| **Tests and lint** | Done | `npm test` / `npm run lint` in both packages |

Things the browser run caught that unit tests didn't: two real session bugs in the
SPA (a stuck loading screen for signed-out visitors, and login not leaving the
login page). Both are fixed (see the "fix(web)" note in the phase 7 commit).

---

## Assumptions

- **Member onboarding:** there's no email delivery. An admin creates the user
  and receives a generated temporary password once, in the API response, to
  share out of band. There's no forced password change yet.
- **Agent assignment:** an agent can assign only to themselves, or unassign,
  and only on tickets they may update (unassigned or already theirs).
- **Title/description edits** follow the same rule as status and priority:
  admin on any ticket, agent on unassigned or own tickets.
- **Closed means frozen:** no field changes, reassignment or new comments.
- **Removal is a soft delete** (`status: removed`). History stays, the email
  stays reserved (emails are globally unique), and open tickets are
  unassigned. Demoting a member to viewer also unassigns them.
- **SLA:** "staff response" means any comment, since only admins and agents can
  comment. Lowering the priority before a breach cancels the pending deadline.
  Once flagged, `overdue` stays set. Each org copies `SLA_MINUTES` at signup;
  there's no UI to change it.
- **`GET /members`** is readable by all roles, because ticket views need names.
  Only the Members management page is admin-only.
- **Sessions** slide while the user is active. A 15-minute idle period ends
  the session.
- **The rate limiter** keys on client IP (`TRUST_PROXY=1` behind nginx) and is
  in-memory per instance.

---

## Next steps

**Product and hardening:**

- Force a password change on first login with a temporary password.
  Invitation emails.
- Commit a browser test suite and run it in CI against `docker compose up`
  (needs a test runner such as Playwright to be approved). Add CSRF
  tokens if the API is ever opened to cross-site clients.
- Paginate comments. Add audit history for ticket changes, and an org settings
  page for `slaMinutes`.
- Transactional outbox for events, so a crash between write and emit can't drop
  an event. Re-validate idle sockets when their JWT expires.
- TypeScript (see status table) and a generated `openapi.yaml`.

**What changes at 100x load:**

- **Several API instances behind a load balancer:**
  - `@socket.io/redis-adapter` so events reach every instance's sockets, with
    sticky sessions or WebSocket-only transport.
  - A shared rate-limit store in Redis.
  - The SLA worker is already safe to run everywhere. At scale, move it to its
    own process so poll load doesn't scale with web replicas.
- **Per-request user lookup:** cache `{status, role, orgId}` in Redis with a
  short TTL. Invalidate it on `member.changed` and keep the immediate-revocation
  guarantee.
- **MongoDB:**
  - Shard on `{orgId, _id}`. Every query already includes `orgId`, so queries
    stay targeted.
  - Read lists from secondaries where slightly stale data is acceptable.
  - Keep the hot-path indexes; at volume, add a `{orgId, assigneeId, createdAt}`
    variant for "my tickets".
  - Make the SLA claim batch-oriented (claim N per round trip).
- **Realtime fan-out:** large orgs make per-org broadcasts expensive. Narrow
  rooms per ticket and per view, and send diffs only to subscribers.
- **Noisy neighbours:** add per-tenant rate limits and quotas. Isolate the
  largest tenants on dedicated shards, or a dedicated database, behind the same
  repository interface.
- **Observability:** add request and tenant ids to logs, metrics on event lag
  and SLA claim latency, and tracing.

---


## AI usage

**Tools used, and what for**

- **Claude** and **ChatGPT** for the Docker setup: `docker-compose.yml` with a
  single-node MongoDB replica set (the `rs.initiate` healthcheck), the API and
  web images, and nginx proxying `/api` and `/socket.io` on one origin.
- **Claude** and **ChatGPT** for the WebSocket layer: cookie-authenticated
  Socket.IO handshakes, server-chosen `org:{orgId}` rooms, and emitting events
  only after the database write succeeds.

**A suggestion I rejected or corrected**

The AI added packages outside the assignment's allowed stack: Playwright for a
browser test suite, `cookie` and `pino-http` at runtime, and several ESLint and
Vite plugins. I rejected all of them and had each one replaced with a few lines
of plain code:

- a small loop to read the session cookie
- one middleware that logs each request
- core-only ESLint rules, with a 10-line local rule so components used only in
  JSX count as "used"

The trade-off I accepted is that `npm run dev` now reloads the page on save
instead of hot-swapping React components.





