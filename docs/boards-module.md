# Boards Module — v1 Plan

Planning doc for the `boards` feature module. No code yet. This is the contract you commit to before opening an editor.

---

## 1. Scope

**v1 ships:** boards, columns, cards. CRUD + reorder. Single-owner only (no sharing).

**Deferred to later versions:**

- Sharing / members / roles
- Labels, assignees, attachments, comments, activity log
- Due dates, priorities, checklists
- Realtime / WebSockets
- Soft delete / archive

---

## 2. Data Model

### 2.1 `boards`

| Column        | Type         | Null | Default   | Notes                                  |
| ------------- | ------------ | ---- | --------- | -------------------------------------- |
| `id`          | `serial`     | no   | auto      | PK                                     |
| `owner_id`    | `integer`    | no   | —         | FK → `users.id`                        |
| `title`       | `text`       | no   | —         | 1–120 chars                            |
| `description` | `text`       | yes  | `null`    | 0–4000 chars                           |
| `color`       | `text`       | yes  | `null`    | one of the 8 preset palette names (see §2.4) |
| `created_at`  | `timestamp`  | no   | `now()`   |                                        |
| `updated_at`  | `timestamp`  | no   | `now()`   | bump on every mutation                 |

**Indexes**

- PK `(id)`
- `idx_boards_owner_id` on `(owner_id)` — for "list my boards"

**Referential actions:** no DB-level cascade. Cascading is handled in the service inside a transaction (see §4).

---

### 2.2 `columns`

| Column       | Type        | Null | Default | Notes                   |
| ------------ | ----------- | ---- | ------- | ----------------------- |
| `id`         | `serial`    | no   | auto    | PK                      |
| `board_id`   | `integer`   | no   | —       | FK → `boards.id`        |
| `title`      | `text`      | no   | —       | 1–80 chars              |
| `position`   | `integer`   | no   | —       | gapped, see §3          |
| `created_at` | `timestamp` | no   | `now()` |                         |
| `updated_at` | `timestamp` | no   | `now()` |                         |

**Indexes**

- PK `(id)`
- `idx_columns_board_position` on `(board_id, position)` — for ordered reads and reorder scans

---

### 2.3 `cards`

| Column        | Type        | Null | Default | Notes                |
| ------------- | ----------- | ---- | ------- | -------------------- |
| `id`          | `serial`    | no   | auto    | PK                   |
| `column_id`   | `integer`   | no   | —       | FK → `columns.id`    |
| `title`       | `text`      | no   | —       | 1–200 chars          |
| `description` | `text`      | yes  | `null`  | 0–20 000 chars       |
| `position`    | `integer`   | no   | —       | gapped, see §3       |
| `created_at`  | `timestamp` | no   | `now()` |                      |
| `updated_at`  | `timestamp` | no   | `now()` |                      |

**Indexes**

- PK `(id)`
- `idx_cards_column_position` on `(column_id, position)` — for ordered reads
- `idx_cards_column_id` on `(column_id)` — for cheap "delete all by column"

---

### 2.4 Color Palette

The `color` column on `boards` (and, later, the `color` column on `labels`) must be one of these 8 preset names. The backend stores the **name** (short string), not the hex — this lets the frontend theme map names to light/dark-appropriate shades without a migration.

| Name      | Light-mode hex | Dark-mode hex | Notes                              |
| --------- | -------------- | ------------- | ---------------------------------- |
| `slate`   | `#64748B`      | `#94A3B8`     | neutral default, professional      |
| `blue`    | `#3B82F6`      | `#60A5FA`     | trust / calm                       |
| `teal`    | `#14B8A6`      | `#2DD4BF`     | balance, "in flow" columns         |
| `emerald` | `#10B981`      | `#34D399`     | success, "done" columns            |
| `amber`   | `#F59E0B`      | `#FBBF24`     | attention, "blocked" columns       |
| `rose`    | `#F43F5E`      | `#FB7185`     | urgent / critical                  |
| `violet`  | `#8B5CF6`      | `#A78BFA`     | creative work / design boards      |
| `indigo`  | `#6366F1`      | `#818CF8`     | depth, planning boards             |

**Palette rationale (ties to the design prompt):**

- All 8 are mid-saturation, muted — "calm palette, generous whitespace" is the product tone. No neon, no pure primaries.
- Each has distinct-enough hue and luminance to be distinguishable for label chips and board covers at small sizes.
- Light/dark pairs keep contrast consistent across themes — the frontend switches hex based on `prefers-color-scheme`; the backend never cares.
- `slate` is the implicit default when `color` is `null`. Storing `null` vs `"slate"` is meaningful: `null` = user hasn't picked, `"slate"` = user explicitly chose the neutral.

**Validation:** the DTO enum is exactly:

```
slate | blue | teal | emerald | amber | rose | violet | indigo
```

Anything else → `400 BadRequest`.

---

### 2.5 Relationship sketch

```
users ─1──┐
          │
          └──< boards ─1──< columns ─1──< cards
```

Every board, column, card is owned transitively by exactly one user. The ownership check only ever needs to resolve to `boards.owner_id`.

---

## 3. Ordering Semantics

**Strategy:** gapped integers.

- New item appended to the **end** of its parent gets `position = MAX(position) + 1000`.
- First item in an empty parent gets `position = 1000`.
- Insert between A (pos `X`) and B (pos `Y`) → new item gets `position = floor((X + Y) / 2)`.
- If the gap between neighbours is `< 2` when inserting, **renormalize** the parent's children in one transaction: rewrite all positions as `1000, 2000, 3000, …` in their current order, then do the insert.

**Invariants**

- No two siblings share a `position`. (Enforced in application code, not DB — renormalization keeps it true.)
- `position` values are never exposed in API responses unless explicitly noted. Clients rely on array order.

**Defaults on insert**

- Columns: appended (new column goes to the right edge).
- Cards: appended (new card goes to the bottom of the column). This matches Trello; if you prefer Linear's "top", change this one default.

---

## 4. Cascade Semantics

Deletion is done in the **service layer**, not the DB, using `RunInTransactionUtility`:

- **Delete board** → delete all cards in the board's columns → delete all columns → delete board.
- **Delete column** → delete all cards in the column → delete column.
- **Delete card** → delete card.

Rationale: service-level keeps a single place to add audit logging and future webhooks. DB-level `ON DELETE CASCADE` would bypass those hooks silently.

---

## 5. Authorization

- Every route is `AuthGuard('jwt')`-protected at the module level.
- A `BoardOwnerGuard` runs on every route whose path contains `:boardId` (or any nested resource). It:
  1. Reads `:boardId` from route params.
  2. Looks up the board.
  3. If board not found **or** `board.owner_id !== req.user.id` → throws **404 Not Found** (never 403 — don't leak existence).
  4. Attaches the loaded board to `req` for downstream handlers to reuse.
- Cards and columns accessed directly by ID must also verify their ancestor board's ownership. The deeply-nested URL shape (see §7) makes this automatic — the guard runs because `:boardId` is always present.

---

## 6. Hard Limits (enforced in Zod DTOs)

| Thing                         | Limit                                       |
| ----------------------------- | ------------------------------------------- |
| Board title                   | 1–120 chars                                 |
| Board description             | 0–4 000 chars                               |
| Board color                   | exactly one of the 8 preset names in §2.4  |
| Boards per user               | 50                                          |
| Column title                  | 1–80 chars                                  |
| Columns per board             | 20                                          |
| Card title                    | 1–200 chars                                 |
| Card description              | 0–20 000 chars                              |
| Cards per column              | 500                                         |
| Cards per board (aggregate)   | 2 000                                       |

Limits beyond field length (counts) are checked in the service, not the DTO.

---

## 7. Endpoint Contracts

All routes live under `/api/v1/boards`. All require a valid JWT. All mutations require `emailVerified === true` (already enforced upstream by `login` flow).

### Conventions

- `:boardId`, `:columnId`, `:cardId` are positive integers in the path.
- Request bodies are JSON; validated via `ZodValidationPipe`.
- Timestamps are ISO 8601 strings in responses.
- Error bodies follow the existing `GlobalExceptionFilter` shape.

### 7.1 Boards

#### `GET /boards`

List the authenticated user's boards.

- **Throttle:** none (read).
- **Response 200:**
  ```
  {
    items: [
      {
        id: number,
        title: string,
        description: string | null,
        color: string | null,
        createdAt: string,
        updatedAt: string
      },
      ...
    ]
  }
  ```
- Sorted by `updatedAt DESC`.

#### `POST /boards`

Create a new board.

- **Throttle:** 10/min.
- **Request body:**
  ```
  { title: string, description?: string, color?: string }
  ```
- **Response 201:** the created `Board` (same shape as list item).
- **Errors:**
  - `400` invalid payload.
  - `409 TooManyBoards` if the user already owns 50.

#### `GET /boards/:boardId`

Get one board **with its columns** (cards *not* included — see rationale below).

- **Response 200:**
  ```
  {
    id, title, description, color, createdAt, updatedAt,
    columns: [
      { id, title, createdAt, updatedAt },
      ...
    ]
  }
  ```
  Columns are returned in display order.
- **Errors:** `404` if not found or not owned.

> **Rationale:** loading cards lazily per-column (or via one bulk endpoint) keeps the default board fetch cheap and gives the frontend control over pagination/filtering later.

#### `PATCH /boards/:boardId`

Partial update.

- **Throttle:** 20/min.
- **Request body:** any subset of `{ title, description, color }`.
- **Response 200:** updated `Board`.
- **Errors:** `400`, `404`.

#### `DELETE /boards/:boardId`

Cascade-delete the board and everything under it.

- **Throttle:** 10/min.
- **Response 204:** empty.
- **Errors:** `404`.

---

### 7.2 Columns

#### `GET /boards/:boardId/columns`

List columns of a board, ordered.

- **Response 200:**
  ```
  { items: [{ id, title, createdAt, updatedAt }, ...] }
  ```

(Implementation note: this is redundant with `GET /boards/:boardId` returning columns. Keep it anyway — it's useful for refresh flows.)

#### `POST /boards/:boardId/columns`

Create a column. Appends to the right edge.

- **Throttle:** 30/min.
- **Request body:** `{ title: string }`.
- **Response 201:** created `Column`.
- **Errors:** `400`, `404`, `409 TooManyColumns` (> 20).

#### `PATCH /boards/:boardId/columns/:columnId`

Update title.

- **Throttle:** 30/min.
- **Request body:** `{ title: string }`.
- **Response 200:** updated `Column`.
- **Errors:** `400`, `404`.

#### `DELETE /boards/:boardId/columns/:columnId`

Cascade-delete column and its cards.

- **Throttle:** 20/min.
- **Response 204:** empty.
- **Errors:** `404`.

#### `PATCH /boards/:boardId/columns/:columnId/position`

Reorder the column within its board.

- **Throttle:** 60/min.
- **Request body:**
  ```
  { beforeId?: number, afterId?: number }
  ```
  Exactly one of `beforeId` / `afterId` must be set — place the column immediately before / after the sibling with that id. To move to the absolute start, pass `{ beforeId: <first_column_id> }`. To move to the absolute end, pass `{ afterId: <last_column_id> }`.
- **Response 200:** updated `Column`.
- **Errors:**
  - `400` if both/neither provided, or if the referenced sibling is not in the same board.
  - `404`.

> **Design rule:** ordering APIs take neighbour IDs, **not** raw positions. Clients never send integer positions — that keeps the position strategy a pure backend concern.

---

### 7.3 Cards

#### `GET /boards/:boardId/columns/:columnId/cards`

List cards of a column, ordered.

- **Response 200:**
  ```
  {
    items: [
      { id, title, description, createdAt, updatedAt },
      ...
    ]
  }
  ```

#### `POST /boards/:boardId/columns/:columnId/cards`

Create a card. Appends to the bottom of the column.

- **Throttle:** 60/min.
- **Request body:** `{ title: string, description?: string }`.
- **Response 201:** created `Card`.
- **Errors:** `400`, `404`, `409 TooManyCardsInColumn` (> 500), `409 TooManyCardsInBoard` (> 2000).

#### `GET /boards/:boardId/columns/:columnId/cards/:cardId`

Get one card.

- **Response 200:** `Card`.
- **Errors:** `404`.

#### `PATCH /boards/:boardId/columns/:columnId/cards/:cardId`

Partial update — **does not move the card** (see `move` below).

- **Throttle:** 60/min.
- **Request body:** any subset of `{ title, description }`.
- **Response 200:** updated `Card`.
- **Errors:** `400`, `404`.

#### `DELETE /boards/:boardId/columns/:columnId/cards/:cardId`

Delete one card.

- **Throttle:** 30/min.
- **Response 204:** empty.
- **Errors:** `404`.

#### `PATCH /boards/:boardId/cards/:cardId/move`

Move a card — within its column, or to a different column **in the same board**.

- **Throttle:** 60/min.
- **Request body:**
  ```
  { toColumnId: number, beforeId?: number, afterId?: number }
  ```
  - `toColumnId` is required and must belong to the same board.
  - `beforeId` / `afterId`: exactly one, per the same rule as column reorder. Omit both only if the destination column is empty — then the card goes to position `1000`.
- **Response 200:** updated `Card`.
- **Errors:**
  - `400` if `toColumnId` belongs to another board, or the neighbour is not in `toColumnId`, or both neighbours are set.
  - `404`.

> **Why no `position` field on the card's `PATCH`:** moving is a different operation with different validation. Splitting `PATCH` (edit fields) from `move` (change place) makes both simpler and keeps partial updates safe to retry.

---

## 8. Error Taxonomy

All errors go through the existing `GlobalExceptionFilter`. Use these NestJS exceptions:

| Situation                                      | Exception                 | HTTP |
| ---------------------------------------------- | ------------------------- | ---- |
| Validation failure                             | `BadRequestException`     | 400  |
| Missing/invalid JWT                            | `UnauthorizedException`   | 401  |
| Resource not found *or* not owned              | `NotFoundException`       | 404  |
| Hit a hard limit (counts)                      | `ConflictException`       | 409  |
| Rate-limited                                   | `ThrottlerException`      | 429  |
| Internal                                       | default 500 handler       | 500  |

Use a stable string `code` in the error body for the frontend to switch on (`TooManyBoards`, `TooManyColumns`, `TooManyCardsInColumn`, `TooManyCardsInBoard`, `InvalidNeighbour`, etc.).

---

## 9. Testing Plan

- **Service unit tests** — mirror `auth.service.spec.ts` layout. Mock all three repositories + `RunInTransactionUtility`. Cover:
  - Ownership 404s on every resource.
  - Reorder math: before, after, first-position, last-position, renormalize-on-gap-collision.
  - Cascade-delete order inside the transaction callback.
  - Hard-limit rejections.
- **Integration test** — one happy path hitting real Postgres: create board → add 2 columns → add 3 cards in each → move a card between columns → reorder a column → delete the board. Assert final DB is clean.
- **E2E** — one auth-headers-in-request run of the integration scenario through HTTP.
- No controller unit tests.

---

## 10. Decisions Already Made (don't revisit)

- Integer position with gaps of 1000, renormalize on collision.
- Neighbour-based reorder API (`beforeId` / `afterId`), never raw positions.
- Service-level cascade, no DB-level `ON DELETE CASCADE`.
- Hard delete only (no archive in v1).
- Ownership check returns 404, not 403.
- One `move` endpoint for cards; `PATCH` does fields only.
- `GET /boards/:id` includes columns, excludes cards.

---

## 11. Ready-to-go Checklist

- [ ] This doc reviewed and approved.
- [ ] Table DDL written into `src/schema.ts`.
- [ ] Migration generated and applied locally.
- [ ] Empty module folder created (`src/feature/boards/`).
- [ ] Zod DTO files stubbed (one per endpoint body/params).
- [ ] `BoardOwnerGuard` stubbed.
- [ ] Test files stubbed with `describe` / `it.todo(...)` entries matching §9.

When that's all ticked, start filling in repositories → service → controller in that order, one commit per layer.
