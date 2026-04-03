# Personal Time Observatory — Project Context

> This file is the persistent memory of the project. Every development session starts by reading this file. All decisions are recorded here.

---

## Project Vision

A personal observability system that unifies calendar commitments, tasks, focus sessions, routines, and execution logs into one timeline. The system measures how **planned time compares to actual behavior**.

## Architecture

```
User Interface (Next.js App Router)
       ↓
Next.js API Routes (serverless backend)
       ↓
Supabase (PostgreSQL database)
       ↓
External APIs (Google Calendar, Notion)
```

- **Frontend**: Next.js 16 with App Router, TypeScript
- **Backend**: Next.js API routes (no separate server)
- **Database**: Supabase (PostgreSQL)
- **Deployment target**: Vercel
- **Timer rule**: All timers run client-side; backend stores only start/end/duration

## Database Schema

| Table | Purpose |
|---|---|
| `activities` | Any time-bound activity from any source |
| `execution_logs` | Whether planned blocks were executed |
| `focus_sessions` | Pomodoro sessions |
| `routine_definitions` | Structured routines |
| `routine_steps` | Timed steps within a routine |
| `routine_runs` | Records of routine completion |

Full schema: `database/schema.sql`

## Implemented Endpoints

| Method | Endpoint | Status |
|---|---|---|
| `GET` | `/api/health` | ✅ Done |

## Pending Work

- [ ] Phase 2: Activity System (Google Calendar integration)
- [ ] Phase 3: Execution Tracking
- [ ] Phase 4: Focus Sessions
- [ ] Phase 5: Reports
- [ ] Phase 6: Routine System
- [ ] Frontend (only after backend is complete)

## Known Limitations

- Supabase MCP token not configured — schema must be run manually via SQL Editor
- Google Calendar OAuth not set up yet (Phase 2 prerequisite)
- Single-user system — no RLS, uses service role key

## Decision Log

| Date | Decision | Reason |
|---|---|---|
| 2026-03-14 | Use service role key (no RLS) | Single-user system, simpler architecture |
| 2026-03-14 | Schema in `database/schema.sql` | Manual migration via Supabase SQL Editor |
| 2026-03-14 | Tailwind kept from init | Was included by default, useful for future frontend |
