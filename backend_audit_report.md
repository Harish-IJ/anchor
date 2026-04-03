# Personal Time Observatory — Backend Capability & Integration Map

This document serves as a comprehensive guide for testing the backend architecture of the Personal Time Observatory before frontend development begins. 

It details the schemas, relationships, API capabilities, data pipelines, and testing scenarios required to validate the system.

---

## 1. System Understanding & Architecture

The backend acts as an aggregation and execution engine. 

1. **Ingestion:** Multiple disparate external sources (Google Calendar, Notion, and manually uploaded CSVs) are polled or imported.
2. **Synchronization:** Data is stored raw (`notion_items`), then synchronized over to a unified `activities` table.
3. **Execution:** The `activities` table acts as the heart of the system. Users record whether they completed an activity (`execution_logs`) or run Pomodoro timers against them (`focus_sessions`).
4. **Analytics:** The `reports` system aggregates data from `execution_logs`, `activities`, and `focus_sessions` to track habit adherence and productivity.

### Core Tables & Relationships
- `activities`: The universal event container. 
  - `external_source` (ENUM: 'google_calendar', 'notion', 'manual', 'email')
  - `external_id` (Links back to the source system's ID)
- `execution_logs`: Tracks daily completion. 
  - `activity_id` -> `activities.id`
- `focus_sessions`: Timed work blocks. 
  - `activity_id` -> `activities.id`
- `routine_definitions` -> `routine_steps` -> `routine_runs`: Manages multi-step recurring workflows.

---

## 2. Capability Inventory (By Layer)

### Data Ingestion
| Capability | Endpoint | Purpose | Tables Touched | Expected Output |
| :--- | :--- | :--- | :--- | :--- |
| **Google Calendar Sync** | `GET /api/calendar?start=&end=` | Fetches events and heavily normalizes them directly into the activities table. | `activities`, `oauth_tokens` | Array of mapped `activities` |
| **Notion Sync** | `POST /api/notion/sync` | Pulls tasks from registered Notion DBs, stores them raw, and normalizes them. | `notion_items`, `activities` | `{ synced_count: number }` |
| **CSV Import** | `POST /api/notion/items/import` | Offline task ingestion via CSV or ZIP, automatically deduplicated and filtered. | `notion_sources`, `notion_items` | `{ imported_count: number }` |

### Raw Data CRUD
| Capability | Endpoint | Purpose | Tables Touched | Expected Output |
| :--- | :--- | :--- | :--- | :--- |
| **List Notion Sources** | `GET /api/notion/sources` | Lists configured Notion databases. | `notion_sources` | Array of sources |
| **Register Source** | `POST /api/notion/sources` | Registers a new Notion DB to track. | `notion_sources` | The created source |
| **List Notion Items** | `GET /api/notion/items` | Lists raw imported Notion pages. | `notion_items` | Array of raw items |
| **Update Notion Item** | `PATCH /api/notion/items` | Two-way sync: updates the local cache AND fires a request to the Notion API to update the live page. | `notion_items` | The updated item |
| **Delete Notion Item** | `DELETE /api/notion/items` | Soft-deletes locally, with an option to archive the page on Notion's servers. | `notion_items` | `{ success: boolean }` |

### Execution Tracking
| Capability | Endpoint | Purpose | Tables Touched | Expected Output |
| :--- | :--- | :--- | :--- | :--- |
| **Log Execution** | `POST /api/execution` | Marks an activity as completed/skipped/partial. | `execution_logs` | The created log |
| **Get Logs by Date** | `GET /api/execution?date=` | Fetches a day's execution state. | `execution_logs` | Array of logs |
| **Manage Focus** | `POST /api/focus` | Starts or stops a Pomodoro session against an activity. | `focus_sessions` | The session record |
| **Get Focus Sessions** | `GET /api/focus?activity_id=` | Retrieves history of focus time for a specific task. | `focus_sessions` | Array of sessions |

### Routines
| Capability | Endpoint | Purpose | Tables Touched | Expected Output |
| :--- | :--- | :--- | :--- | :--- |
| **List Routines** | `GET /api/routines` | Lists definitions and steps. | `routine_definitions`, `routine_steps` | Array of routines |
| **Manage Routines** | `POST /api/routines` | Multi-action endpoint to create, start, or step through a routine. | `routine_definitions`, `routine_steps`, `routine_runs` | Lifecycle metadata |

### Reporting
| Capability | Endpoint | Purpose | Tables Touched | Expected Output |
| :--- | :--- | :--- | :--- | :--- |
| **Weekly Report** | `GET /api/reports?type=weekly` | Aggregates focus time, execution rates, and routine completions. | `execution_logs`, `focus_sessions`, `activities` | Statistical JSON |
| **Habit Report** | `GET /api/reports?type=habits` | Tracks adherence to specific categories over time. | `execution_logs`, `activities` | Adherence JSON |

---

## 3. Data Flow Between Systems

### Flow 1: Google Calendar → Activity → Focus Session → Weekly Report
1. **Trigger:** `GET /api/calendar?start=X&end=Y`
2. **Ingestion:** Backend queries Google API using tokens from `oauth_tokens`.
3. **Normalization:** Events are mapped to the `activities` table with `external_source = 'google_calendar'` and `external_id = event.id`.
4. **Execution:** User triggers `POST /api/focus` with `action=start` and `activity_id = [mapped_id]`, starting a timer in `focus_sessions`.
5. **Analytics:** `GET /api/reports?type=weekly` aggregates `focus_sessions.duration_minutes` joined against `activities`.

### Flow 2: Notion Task → Raw Table → Activity → Execution Log
1. **Trigger:** `POST /api/notion/sync` runs for a registered source.
2. **Ingestion:** Notion API is polled. Pages are upserted into `notion_items` as JSONB.
3. **Normalization:** Triggers/services map `notion_items` to `activities` (`external_source = 'notion'`, `external_id = notion_page_id`).
4. **Execution:** User triggers `POST /api/execution` with `status='completed'`.
5. **Two-Way Flow:** Updating the task status may trigger a `PATCH /api/notion/items` to physically check off the task on the Notion server.

### Maintenance of Synchronization
- **Consistency:** Maintained via the `external_id` (Google Event ID or Notion Page ID) and `external_source` combination on the `activities` table.
- **Upserts:** When syncs pull data that already exists, they match on the `external_id` unique composite index and run an SQL `UPDATE`, preventing duplicates while pulling down title/time changes.

---

## 4. CRUD Capabilities & Mutability Matrix

| Entity | Create | Read | Update | Delete | Syncs Back to External? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Google Calendar Events**| Ext | Yes | Local Only | Local Only | **No** (Read-Only) |
| **Notion Items** | Ext/CSV | Yes | Yes | Yes (Soft) | **Yes** (Two-Way Native Sync support via PATCH/DELETE endpoints) |
| **Activities** | Auto/Ext | Yes | Yes | Yes | **Depends** on Source. Manual ones stay local. |
| **Execution Logs** | Yes | Yes | Yes | Yes | Local |
| **Focus Sessions** | Yes | Yes | Yes | Yes | Local |

*Note on Activities: Once created by an external sync, fields like `title`, `start_time`, and `end_time` may be overwritten on the next sync unless local overrides are explicitly flagged.*

---

## 5. End-to-End Testing Scenarios (Bruno Workflows)

### Scenario A — Offline Notion Task Execution
1. **Sync:** Run `POST /api/notion/items/import` via Bruno using the File/Binary upload with a Notion `.zip` export.
2. **Verify Raw:** Run `GET /api/notion/items` to see the tasks in the local cache.
3. **Execute:** Run `POST /api/execution` passing the `activity_id` of one of those newly imported tasks, setting `status` to `completed`.
4. **Report:** Run `GET /api/reports?type=weekly`. Verify that the `execution_rate` percentage went up.

### Scenario B — The Two-Way Synchronization Test
1. **Register:** Run `POST /api/notion/sources` to attach a live test Notion board.
2. **Pull:** Run `POST /api/notion/sync`.
3. **Modify Local + Push:** Run `PATCH /api/notion/items` modifying the `properties` payload of a task to mark its status as Done. 
4. **Verify External:** Open the Notion website. Verify the task physically moved to the Done column.

### Scenario C — Calendar Event Focus Tracking
1. **Pull:** Run `GET /api/calendar?start=...`.
2. **Focus:** Run `POST /api/focus` with `action=start` and the Calendar Event `activity_id`.
3. **Stop:** Run `POST /api/focus` with `action=stop`.
4. **Verify:** Check Supabase `focus_sessions` table to ensure `duration_minutes` was accurately calculated.

---

## 6. Schema Consistency Checks (Invariants)

1. **Foreign Key Integrity:** 
   - `execution_logs.activity_id` and `focus_sessions.activity_id` MUST map to a valid `activities.id`.
   - *SQL Check:* `SELECT * FROM execution_logs WHERE activity_id NOT IN (SELECT id FROM activities);` (Should return 0)
2. **External ID Uniqueness:** 
   - The combination of `external_source` + `external_id` must be unique to prevent sync duplication.
   - *SQL Check:* `SELECT external_source, external_id, COUNT(*) FROM activities GROUP BY 1, 2 HAVING COUNT(*) > 1;` (Should return 0)
3. **Notion Source Deletion Cascade:** 
   - Deleting a Notion source MUST cascade delete all associated Notion Items.
   - *SQL Check:* Ensure `ON DELETE CASCADE` is functioning correctly under load.

---

## 7. 🔐 Security & Data Integrity Layer

The backend currently operates as a single-user local system but must still enforce strong security practices for external API credentials and synchronization safety.

### Credential Encryption
All third-party credentials stored in the database must be encrypted at rest.
**Affected tables:**
- `oauth_tokens` (`access_token`, `refresh_token`)
- `notion_sources` (`api_key`)
- `gmail_accounts` (`access_token`, `refresh_token`)

**Encryption strategy:** AES-256-GCM symmetric encryption
**Implementation location:** `frontend/lib/crypto.ts`
**Example usage:**
```typescript
encryptToken(token: string): string
decryptToken(cipher: string): string
```
**Storage rule:** Only encrypted values are stored in Supabase. Tokens are decrypted only when making outbound API calls. This prevents credential leakage in the event of database exposure.

### API Authentication Middleware
All API routes must eventually enforce authentication.
**Planned middleware:** `frontend/middleware/apiAuth.ts`
**Strategy:** `X-API-KEY` header validation
**Future upgrade path:** Supabase Auth or OAuth session validation. This prevents unauthorized external calls once the service is deployed.

### Rate Limiting for Sync Endpoints
External APIs impose request limits, so sync endpoints must be throttled.
**Affected routes:**
- `POST /api/notion/sync`
- `GET /api/calendar`
- `POST /api/gmail/sync`

**Strategy:** Check `last_synced_at` timestamp. Reject requests if called too frequently (e.g., Notion sync: minimum 60 seconds). This protects the system from quota exhaustion and accidental loops.

### External Source Deduplication
To prevent duplicate activity creation during repeated syncs, the following invariant must hold:
`(external_source, external_id)` must be unique

**SQL enforcement:**
```sql
CREATE UNIQUE INDEX idx_activity_external_unique 
ON activities (external_source, external_id);
```
This guarantees idempotent sync operations.

### Database Update Tracking
Several tables must track modification time for debugging and analytics.
**Required column:** `updated_at TIMESTAMPTZ`
**Tables affected:** `activities`, `execution_logs`, `focus_sessions`, `notion_items`, `email_items`
**Trigger:** `update_timestamp()`
This ensures every modification is traceable.

### Activity Override Protection
Activities originating from external sources may be overwritten during future syncs. To protect manual edits, the system must support an override flag.
**Example column:** `activities.local_override BOOLEAN DEFAULT false`
**Behavior:** If `local_override = true`, external sync cannot modify title, schedule, or metadata. This prevents user edits from being accidentally overwritten by external updates.

---

## 8. Missing or Weak Areas (Architecture Review)

1. **Email/Gmail Sync is Stubbed:** The database schema has an `'email'` enum for external sources, and the user requested mapping "Gmail Task → Activity", but there are no backend routes built for `/api/email/sync` like there are for Calendar and Notion.
2. **Missing `activities` API:** There are sync engines to populate `activities`, but no direct `GET /api/activities` route to list the normalized timeline. The frontend will likely need a unified timeline view combining all sources rather than querying `notion_items` and Calendar separately.
3. **API Security:** All routes are currently open and multi-tenant keys (like Notion API tokens) are plaintext.

## 9. 🧪 System Validation Checklist

Before frontend development begins, the following checks must pass.

### Credential Security
Verify tokens are encrypted in the database.
```sql
SELECT access_token FROM oauth_tokens;
```
**Expected result:** Encrypted string (not plaintext)

### Activity Deduplication
Ensure external sync does not create duplicates.
```sql
SELECT external_source, external_id, COUNT(*) 
FROM activities 
GROUP BY 1,2 
HAVING COUNT(*) > 1;
```
**Expected result:** 0 rows

### Foreign Key Integrity
Execution logs and focus sessions must always reference valid activities.
```sql
SELECT * 
FROM execution_logs 
WHERE activity_id NOT IN (SELECT id FROM activities);
```
**Expected result:** 0 rows

### Sync Idempotency
Running the same sync twice must not change row counts unexpectedly.
**Test:**
1. `POST /api/notion/sync`
2. `POST /api/notion/sync`

**Expected behavior:** First run: inserted rows. Second run: updated rows only.

---

## 10. Final Conclusion

The **Personal Time Observatory Backend** successfully implements a complex, multi-source ingestion engine. 

The most critical and successful piece of architecture is the **Unified Activity Layer**, which reliably decouples the execution mechanics (Pomodoros, task checking, analytics) from the erratic APIs of Google and Notion.

### One More Architectural Insight
The moment you add encryption and deduplication rules into the architecture document, something interesting happens: the system stops being "a project" and starts becoming a platform.

Your backend is quietly evolving into three stable layers:
1. **Ingestion Layer**
2. **Normalization Layer**
3. **Execution Layer**

Once those layers are secure and deterministic, the frontend becomes a view, not a dependency. And that's exactly the right order to build things in.

To proceed to frontend development, the developer must execute the **End-to-End Testing Scenarios** in Bruno to validate the exact JSON shapes that the React frontend will need to consume, paying special attention to how `activities` act as the primary foreign-key target for all user interactions.
