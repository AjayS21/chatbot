# Spur — Omnichannel Support Chat (Monorepo)

Spur is a small, production-minded foundation for an **omnichannel customer support assistant**.

Today it includes:
- A **Fastify + TypeScript** backend with PostgreSQL persistence via Prisma
- A **SvelteKit + TypeScript** frontend with a simple live chat UI
- An **OpenAI-backed LLM integration** for generating replies (prompted as an e-commerce support agent)

This codebase is designed to make it obvious how additional channels (WhatsApp, Instagram, etc.) can plug into the same core business logic without rewriting the system.

## Repo structure

- `backend/`: API + services + DB access
- `frontend/`: SvelteKit UI (+ server-side proxy endpoints)
- `docker-compose.yml`: local Postgres (optional)

## Prerequisites

- **Node.js** 20+ (tested with Node 24)
- **npm** 10+
- **PostgreSQL** (or Docker Desktop for local Postgres via compose)

## Running the apps

Install dependencies (root workspace):

```bash
npm install
```

### Backend

Start backend in dev mode:

```bash
npm run dev:backend
```

The backend listens on `HOST`/`PORT` (defaults `0.0.0.0:3001`).

### Frontend

Start frontend dev server:

```bash
npm run dev:frontend
```

The frontend calls **SvelteKit server proxy endpoints** under `/api/chat/*`, which then call the backend. This avoids CORS issues and centralizes error handling.

### Run both

```bash
npm run dev
```

## Database setup, migrations, and seed data

### Option A — Local Postgres via Docker (recommended)

1) Start Postgres:

```bash
docker compose up -d
```

2) Configure `DATABASE_URL` (see **Environment variables** below).

3) Apply migrations:

```bash
npm run db:migrate:dev -w backend
```

4) Seed an example conversation:

```bash
npm run db:seed -w backend
```

### Option B — Use your own Postgres

Point `DATABASE_URL` at your Postgres instance, then run the same migration/seed commands.

### Migrations in source control

Prisma migration SQL is checked in under:
- `backend/prisma/migrations/`

This makes schema changes explicit and reviewable.

## Environment variables

### Backend

- **`DATABASE_URL`** (required for any persistence-backed endpoints)
  - Example: `postgresql://spur:spur@localhost:5432/spur_dev?schema=public`
- **`OPENAI_API_KEY`** (required to generate real LLM replies)
- **`OPENAI_MODEL`** (optional; defaults to `gpt-4o-mini`)
- **`LLM_TIMEOUT_MS`** (optional; defaults to `15000`)
  - Hard caps provider latency so a single slow LLM call can’t pin a request indefinitely.
- **`LLM_HISTORY_LIMIT`** (optional; defaults to `20`)
  - Limits how many recent messages are sent to the LLM to control context size/cost.
- **`LLM_MAX_OUTPUT_TOKENS`** (optional; defaults to `250`)
  - Caps response size to keep replies fast and inexpensive.
- **`PORT`** (optional; default `3001`)
- **`HOST`** (optional; default `0.0.0.0`)

See `backend/ENV.example` for the full list.

### Frontend (server-side, optional)

- **`BACKEND_URL`**: base URL for the backend API used by the SvelteKit server proxy routes
  - Default: `http://localhost:3001`

Why server-side: the browser never needs to know the backend origin, which simplifies deployment and future auth.

## Architecture overview

### High-level flow

1) Frontend sends user input → `POST /api/chat/message` (SvelteKit server)
2) SvelteKit proxies → `POST /chat/message` (Fastify)
3) Backend service:
   - Validates session, creates conversation when missing
   - Persists inbound message
   - Loads recent message history
   - Calls LLM `generateReply()` with normalized history
   - Persists outbound message (and minimal LLM metadata)
4) Frontend renders the reply; sessionId is stored in `localStorage`

### Separation of concerns (backend)

- **Routes (`backend/src/routes/`)**
  - HTTP concerns only: validation + request/response wiring
  - Stays thin so future webhook routes (WhatsApp/Instagram) can delegate into the same services

- **Services (`backend/src/services/`)**
  - Business logic, channel-agnostic
  - Example: `backend/src/services/chat/chatService.ts` contains the core chat orchestration

- **Data access (`backend/src/db/`)**
  - `backend/src/db/client.ts`: Prisma client lifecycle + DB configuration errors
  - `backend/src/db/repositories/*`: thin repository functions that isolate Prisma usage

This layering keeps the system easy to extend:
- WhatsApp webhook handler → maps inbound event to `{ sessionId?, message }` → calls `sendChatMessage()`
- Instagram DM handler → same

### LLM provider & prompting strategy

**Goal:** respond like a helpful e-commerce support agent while staying robust and cost-bounded.

- **Provider**:
  - Uses the OpenAI Node SDK (`openai`) and the `chat.completions` API.
  - Default model is `gpt-4o-mini` (override via `OPENAI_MODEL`).

- **Encapsulation**:
  - `backend/src/services/llm/generateReply.ts` is provider-facing logic
  - It accepts **normalized history** (`{ role, content }`) and returns `{ reply, meta }`
  - It does **not** talk to the database—persistence is the service layer’s responsibility

- **Prompting**:
  - A **system prompt** sets persona + guardrails and includes an explicit **Store Policies** section
  - Store policies are written as short, structured facts and the agent is instructed to answer policy questions
    using those facts first (reduces guessing/hallucination for FAQs)
  - FAQ knowledge (shipping/returns/support hours) is injected as an additional **system message** (redundancy helps recall)
  - Recent conversation history is appended to maintain context

- **Failure handling**:
  - Missing API key, provider errors, or empty completions return a **safe fallback reply**
  - Minimal metadata (`provider`, `model`, `usedFallback`, `errorCode`) can be stored for observability

Prompt text lives in `backend/src/services/llm/prompts.ts` so it can evolve independently from networking/persistence.

### Token, latency, and cost controls

These controls exist to keep UX predictable (no “stuck” requests), reduce spend, and avoid hitting provider context limits:

- **History is bounded** (`LLM_HISTORY_LIMIT`, default `20`)
  - Applied both when reading from DB and again in the LLM layer defensively.
- **Output is capped** (`LLM_MAX_OUTPUT_TOKENS`, default `250`)
  - Keeps responses short and limits worst-case token spend.
- **Provider calls time out** (`LLM_TIMEOUT_MS`, default `15000`)
  - Prevents slow upstream calls from tying up server capacity.

## Trade-offs (deliberate)

- **Simple history + FAQ injection (no retrieval yet)**:
  - Pros: minimal moving parts; easy to understand and ship
  - Cons: doesn’t scale to large knowledge bases; may miss nuanced policy details

- **Thin repositories vs. heavy domain modeling**:
  - Pros: clear boundaries without over-engineering
  - Cons: fewer compile-time guarantees than a richer domain layer

- **SvelteKit server proxy instead of direct browser → backend**:
  - Pros: no CORS issues; centralized error mapping; future auth/token handling is straightforward
  - Cons: slightly more server work in the frontend app

## If I had more time

- **Channel adapters**:
  - Add explicit “channel adapters” (WhatsApp/Instagram/Web) that map provider payloads into a normalized event model.

- **Better observability**:
  - Structured request IDs, correlation IDs, and persisted traces for LLM calls (without leaking secrets).

- **Richer conversation model**:
  - Participants table, channel identifiers, message types (attachments), and idempotency keys for webhook retries.

- **LLM improvements**:
  - Add tool/function calling for order lookup (once that backend exists)
  - Add retrieval (RAG) for policies and product docs
  - Add safety filters and more explicit refusal policies

- **Frontend polish**:
  - Better message timestamps, resend on transient failures, optimistic retry UI, and accessibility audits.

