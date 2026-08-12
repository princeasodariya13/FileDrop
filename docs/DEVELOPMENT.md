# Development

## Prerequisites
- Node.js 20+
- A MongoDB instance (local or Atlas)
- A Cloudflare R2 bucket (see `R2_SETUP.md`) — required for real uploads/downloads to work

## Setup

```bash
cp .env.example backend/.env
cp .env.example frontend/.env.local   # only NEXT_PUBLIC_API_URL is read here

cd backend && npm install
cd ../frontend && npm install
```

## Run

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm run dev
```

Frontend: http://localhost:3000 · Backend: http://localhost:5000/health

## Verification commands

```bash
cd backend
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # tsc -> dist/
npm test            # vitest — requires mongodb-memory-server to download a mongod binary

cd frontend
npm run typecheck
npm run lint
npm run build        # next build
```

## Known open items (not yet built)

These were deferred to keep this handoff honest about scope rather than
claiming a fully finished app:

- **QR code on the share page** — the PRD mentions it conditionally ("if
  required"); not implemented yet. Would slot into
  `frontend/components/upload/ShareResult.tsx`.
- **Backend test coverage beyond storage reservation** — expiration,
  download-limit race, and cleanup-job tests described in PRD §28 are not
  yet written. The reservation concurrency tests in
  `backend/src/tests/storageReservation.test.ts` are the only ones present,
  and they could not be executed in the build sandbox this project was
  scaffolded in (see below) — review them for correctness before relying on
  them.
- **No CI config** (GitHub Actions etc.) — not requested explicitly beyond
  "run checks," so left out per the anti-overengineering guidance in PRD
  §31.
- **No user accounts** — omitted per PRD §31/§10 ("only if required").

## What was actually verified vs. not, in the environment this was built in

- ✅ `backend`: `npm install`, `tsc --noEmit`, `eslint`, and `tsc` (full
  build to `dist/`) all ran and passed cleanly.
- ✅ `frontend`: `npm install`, `tsc --noEmit`, `next lint`, and `next build`
  all ran and passed cleanly (a production bundle was generated).
- ❌ `backend` tests: could not run. `mongodb-memory-server` needs to
  download a real `mongod` binary from `fastdl.mongodb.org`, which was not
  reachable from the sandbox this was built in. Run `npm test` yourself in
  an environment with normal internet access to confirm.
- ❌ End-to-end upload/download against real R2/MongoDB: not exercised —
  no live credentials were available. The code paths are real (no mocked
  R2 or fake progress), just unexercised against live infrastructure.
