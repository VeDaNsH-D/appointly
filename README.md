# Appointly - Clinic Appointment Booking REST API

A production-grade, concurrency-safe REST API for clinic appointment booking built with Node.js, Express, TypeScript, PostgreSQL, and Prisma ORM.

---

## 1. Project Overview & Scope

Appointly manages appointment slot publishing, booking, and cancellation for healthcare clinics. It is designed specifically as an evaluated backend engineering assessment with an emphasis on **data consistency**, **concurrency control under heavy load**, **database-level transactional guarantees**, and **thorough automated testing**.

### Scope Boundaries & Explicit Non-Goals
- **Authentication & Authorization**: Explicitly out of scope. In accordance with the specification, `clinicId` and `patientId` are passed directly as resource identifiers in path parameters and request payloads.
- **Frontend / UI**: Backend REST API only.
- **Payment Processing**: Not required.
- **Docker Requirement**: Runs natively on Node.js and PostgreSQL.

---

## 2. Tech Stack & Prerequisites

### Tech Stack
- **Runtime**: Node.js (v20+ recommended, developed & tested on Node v22.19.0)
- **Language**: TypeScript 5.7+ (Strict mode enabled, `noImplicitAny`, strict null checks)
- **Framework**: Express.js 4.21+
- **Database**: PostgreSQL (v14+ recommended)
- **ORM & Migrations**: Prisma ORM 6.4+ with SQL migrations
- **Validation**: Zod 3.24+ (Strict boundary validation for body, query params, and route parameters)
- **Test Framework**: Vitest 3.0+ & Supertest 7.0+

### Prerequisites
- [Node.js](https://nodejs.org/) installed (`node -v` >= 20.0.0).
- [PostgreSQL](https://www.postgresql.org/) instance running locally or hosted remotely (e.g., Render, Neon, Supabase, or AWS RDS).
- Command-line tools: `npm` and `curl` (for testing endpoints).

---

## 3. Architecture & Directory Structure

The codebase is organized into distinct layers ensuring separation of concerns:

```
┌────────────────────────────────────────────────────────┐
│                      HTTP Layer                        │
│   (Express, CORS, JSON Body Parsing, Router Table)     │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                   Validation Layer                     │
│         (Zod Schemas: Body, Query, URL Params)         │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                  Controllers Layer                     │
│  (HTTP Request/Response translation, Status Codes)     │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                    Services Layer                      │
│   (Domain Logic, State Transitions, Concurrency Locks) │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│               Data Access & Database Layer             │
│   (Prisma ORM Client, PostgreSQL & SQL Migrations)     │
└────────────────────────────────────────────────────────┘
```

### Directory Tree
```
appointly/
├── .env.example                                      # Environment template with placeholder values
├── .gitignore                                        # Excludes node_modules, dist, and all .env files
├── LICENSE                                           # MIT License
├── package.json                                      # Dependencies, scripts, and build configurations
├── tsconfig.json                                     # Strict TypeScript compiler options
├── vitest.config.ts                                  # Vitest test runner configuration
├── README.md                                         # Project documentation and API guide
├── prisma/
│   ├── schema.prisma                                 # Prisma data models and relation schema
│   └── migrations/
│       ├── 20261022000000_init/
│       │   └── migration.sql                         # Initial tables, indices, and partial unique index
│       └── 20261022000001_overlap_exclusion_and_indexes/
│           └── migration.sql                         # btree_gist extension and exclusion constraint
├── src/
│   ├── app.ts                                        # Express application factory & middleware setup
│   ├── server.ts                                     # HTTP server bootstrap with graceful shutdown
│   ├── config/
│   │   └── env.ts                                    # Zod-validated environment configuration
│   ├── errors/
│   │   └── app-error.ts                              # Custom AppError classes (BadRequest, NotFound, Conflict)
│   ├── lib/
│   │   └── prisma.ts                                 # PrismaClient singleton instance
│   ├── middleware/
│   │   ├── error-handler.ts                          # Centralized error handler ({ error: { code, message } })
│   │   └── validate.ts                               # Zod validation middleware for body, query, and params
│   ├── schemas/
│   │   ├── clinic.schema.ts                          # Clinic request validation schemas
│   │   ├── patient.schema.ts                         # Patient request validation schemas
│   │   ├── slot.schema.ts                            # Slot validation (future time, from/to query filters)
│   │   └── booking.schema.ts                         # Booking validation schemas
│   ├── services/
│   │   ├── clinic.service.ts                         # Clinic business logic
│   │   ├── patient.service.ts                        # Patient business logic
│   │   ├── slot.service.ts                           # Slot publishing, overlap check, cancellation rules
│   │   └── booking.service.ts                        # Concurrency-safe booking and slot reopening logic
│   ├── controllers/
│   │   ├── clinic.controller.ts                      # Clinic HTTP request handlers
│   │   ├── patient.controller.ts                     # Patient HTTP request handlers
│   │   ├── slot.controller.ts                        # Slot HTTP request handlers
│   │   └── booking.controller.ts                     # Booking HTTP request handlers
│   └── routes/
│       ├── clinic.routes.ts                          # /api/clinics routes
│       ├── patient.routes.ts                         # /api/patients routes
│       ├── slot.routes.ts                            # /api/slots routes
│       ├── booking.routes.ts                         # /api/bookings routes
│       └── index.ts                                  # Unified API router + healthcheck
└── tests/
    ├── setup.ts                                      # Vitest setup: loads .env.test
    ├── unit/
    │   ├── validation.test.ts                        # Zod schema validation tests
    │   ├── error-handler.test.ts                     # Centralized error mapping tests
    │   ├── slot-service.test.ts                      # Slot domain rules unit tests
    │   └── booking-service.test.ts                   # Concurrency locking logic unit tests
    └── integration/
        ├── health.test.ts                            # Healthcheck & 404 router tests
        ├── api-routes.test.ts                        # Supertest mocked integration tests
        ├── db-e2e.test.ts                            # Direct PostgreSQL persistence & constraint tests
        └── http-e2e.test.ts                          # Full HTTP E2E suite (all 14 required cases + 10 concurrent requests)
```

---

## 4. Database Schema & State Transitions

### Entity Relationship Model

```
┌─────────────────────────┐         ┌─────────────────────────┐
│         Clinic          │         │         Patient         │
├─────────────────────────┤         ├─────────────────────────┤
│ id: String (UUID, PK)   │         │ id: String (UUID, PK)   │
│ name: String            │         │ name: String            │
│ createdAt: DateTime     │         │ email: String?          │
│ updatedAt: DateTime     │         │ createdAt: DateTime     │
└────────────┬────────────┘         │ updatedAt: DateTime     │
             │ 1                    └────────────┬────────────┘
             │                                   │ 1
             │ *                                 │
┌────────────▼────────────┐                      │
│          Slot           │                      │
├─────────────────────────┤                      │
│ id: String (UUID, PK)   │                      │
│ clinicId: String (FK)   │                      │
│ startTime: DateTime     │                      │
│ endTime: DateTime       │                      │
│ status: SlotStatus      │                      │
│   (AVAILABLE, BOOKED,   │                      │
│    CANCELLED)           │                      │
│ createdAt: DateTime     │                      │
│ updatedAt: DateTime     │                      │
└────────────┬────────────┘                      │
             │ 1                                 │
             │                                   │
             │ *                                 │ *
┌────────────▼───────────────────────────────────▼────────────┐
│                           Booking                           │
├─────────────────────────────────────────────────────────────┤
│ id: String (UUID, PK)                                       │
│ slotId: String (FK)                                         │
│ patientId: String (FK)                                      │
│ status: BookingStatus (CONFIRMED, CANCELLED)                │
│ createdAt: DateTime                                         │
│ updatedAt: DateTime                                         │
│ cancelledAt: DateTime?                                      │
└─────────────────────────────────────────────────────────────┘
```

### Booking & Slot State Machine

```
              ┌──────────────────────────────────────────────┐
              │                                              │
              │              Clinic Publishes                │
              │                     │                        │
              │                     ▼                        │
              │             ┌───────────────┐                │
              │             │  Slot Status: │                │
              │             │   AVAILABLE   │                │
              │             └───┬───────▲───┘                │
              │                 │       │                    │
              │   Patient Books │       │ Booking Cancelled  │
              │                 ▼       │ (Reopens slot)     │
              │             ┌───────────┴───┐                │
              │             │  Slot Status: │                │
              │             │    BOOKED     │                │
              │             └───────┬───────┘                │
              │                     │                        │
              │                     │ Slot Cancellation      │
              │                     │ BLOCKED if booked      │
              │                     │ (Returns 409 Conflict) │
              │                     ▼                        │
              │             ┌───────────────┐                │
              └────────────►│  Slot Status: │◄───────────────┘
  Cancel available slot     │   CANCELLED   │  Cancel booking on
  (Transitions to CANCELLED)└───┬───────────┘  already cancelled slot
                                │              (Slot remains CANCELLED)
                                ▼
                       Permanently Closed
                   (Cannot be booked -> 409)
```

### Domain Rules Summary
1. **Slot Publishing**: `startTime` and `endTime` must be valid ISO 8601 strings in UTC. `endTime` must be strictly after `startTime`, and `startTime` must be in the future.
2. **Overlap Policy**: Active slots for the same clinic must never overlap in time. Enforced by application checks and guaranteed at the database engine level via a PostgreSQL exclusion constraint (`EXCLUDE USING gist`).
3. **Slot Booking**: Only `AVAILABLE` slots can be booked. A booked slot transitions to `BOOKED` and creates a `CONFIRMED` booking.
4. **Cancelled Slot Guard**: A cancelled slot can never be booked (returns `409 Conflict` with `SLOT_CANCELLED`).
5. **Slot Cancellation Guard**: A slot with an active booking cannot be cancelled (returns `409 Conflict` with `SLOT_HAS_ACTIVE_BOOKING`) until the booking is cancelled.
6. **Booking Cancellation Reopening**: Cancelling an active booking sets the booking status to `CANCELLED` (with `cancelledAt` timestamp). If the slot is not cancelled, it transitions back to `AVAILABLE`. If the slot was cancelled, it remains `CANCELLED`.
7. **Double Cancellation Guard**: Cancelling an already cancelled booking returns `409 Conflict` (`BOOKING_ALREADY_CANCELLED`).

---

## 5. Concurrency Control & Double-Booking Prevention

### The Race Condition Problem
When two patients simultaneously send a booking request for the same slot:
```
Request A ───► Read Slot (AVAILABLE) ──────────────────────► Write Booking (SUCCESS)
Request B ───► Read Slot (AVAILABLE) ──► Write Booking (DUPLICATE ACTIVE BOOKING!)
```
Without strict concurrency controls, both requests read `AVAILABLE` before either transaction writes, resulting in double-booking.

### How Appointly Solves This in PostgreSQL
Appointly implements **defense-in-depth concurrency control** combining row-level locking, interactive ACID transactions, and database constraints:

```
Client 1 (Request A)                                Client 2 (Request B)
        │                                                   │
        ▼                                                   ▼
BEGIN Transaction A                                 BEGIN Transaction B
        │                                                   │
SELECT * FROM "slots"                               SELECT * FROM "slots"
WHERE "id" = $slotId                                WHERE "id" = $slotId
FOR UPDATE;                                         FOR UPDATE;
        │                                                   │
[Lock Acquired on Slot Row]                         [BLOCKED: Waits for Row Lock]
        │                                                   │
Check: status == AVAILABLE (OK)                             │
UPDATE "slots" SET status = 'BOOKED';                       │
INSERT INTO "bookings" (status = 'CONFIRMED');              │
        │                                                   │
COMMIT Transaction A ──────────────────────────────► [Lock Released to Transaction B]
(Returns 201 Created)                                       │
                                                    Re-evaluates Locked Row:
                                                    status == BOOKED!
                                                            │
                                                    Conflict Detected:
                                                    ROLLBACK Transaction B
                                                    (Returns 409 Conflict: SLOT_UNAVAILABLE)
```

1. **Explicit Row-Level Lock (`SELECT ... FOR UPDATE`)**:
   Inside [`BookingService.bookSlot`](file:///c:/Users/Vedansh/appointly/src/services/booking.service.ts), the transaction starts by executing:
   ```sql
   SELECT * FROM "slots" WHERE "id" = $slotId FOR UPDATE;
   ```
   PostgreSQL acquires an exclusive `RowExclusiveLock` on that specific slot row. All subsequent statements in the transaction run on the exact same connection and transaction context.
2. **Read-Committed Re-evaluation**:
   Under PostgreSQL's default `READ COMMITTED` isolation level, when Request B unblocks after Request A commits, `FOR UPDATE` re-evaluates the query using the newly committed row state. Request B reads `status = 'BOOKED'` and aborts with `409 Conflict` (`SLOT_UNAVAILABLE`).
3. **Database Engine Safeguard (Partial Unique Index)**:
   Even if an application layer error or replica latency bypassed the lock, PostgreSQL enforces a partial unique constraint from [`20261022000000_init/migration.sql`](file:///c:/Users/Vedansh/appointly/prisma/migrations/20261022000000_init/migration.sql):
   ```sql
   CREATE UNIQUE INDEX "unique_active_slot_booking" ON "bookings"("slotId") WHERE "status" = 'CONFIRMED';
   ```
   Any simultaneous write will cause a unique constraint violation (`P2002`), which our centralized error handler translates into a deterministic `409 Conflict` with error code `SLOT_UNAVAILABLE`.

---

## 6. Setup Instructions (Fresh Clone)

### Step 1: Clone and Install
```bash
git clone https://github.com/your-username/appointly.git
cd appointly
npm install
```

### Step 2: Configure Environment Variables
Create your local `.env` from the template:
```bash
cp .env.example .env
```
Edit `.env` with your PostgreSQL connection parameters:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:password@localhost:5432/appointly?schema=public"
```

### Step 3: Create PostgreSQL Database & Run Migrations
1. Ensure PostgreSQL is running. Create the database:
   ```sql
   -- In psql or your database client:
   CREATE DATABASE appointly;
   ```
2. Apply the Prisma migrations:
   ```bash
   npm run migrate
   # (alias for: npx prisma migrate deploy)
   ```
3. Generate the Prisma Client types:
   ```bash
   npm run prisma:generate
   ```

### Step 4: Start the Server
- **Development mode** (with live reload via `tsx`):
  ```bash
  npm run dev
  ```
- **Production mode** (compile TypeScript and start):
  ```bash
  npm run build
  npm start
  ```
The server will start listening at `http://localhost:3000`. Verify with the healthcheck:
```bash
curl -X GET http://localhost:3000/api/health
```

---

## 7. Test Database Setup & Running Tests

To prevent tests from polluting development data, automated tests connect to a dedicated test database (`appointly_test`).

### Step 1: Configure `.env.test`
Create a `.env.test` file in the project root:
```env
NODE_ENV=test
PORT=3001
DATABASE_URL="postgresql://postgres:password@localhost:5432/appointly_test?schema=public&connection_limit=20"
```

### Step 2: Create Test Database & Deploy Migrations
1. Create the test database in PostgreSQL:
   ```sql
   CREATE DATABASE appointly_test;
   ```
2. Apply migrations to the test database:
   - On Linux/macOS:
     ```bash
     DATABASE_URL="postgresql://postgres:password@localhost:5432/appointly_test?schema=public" npx prisma migrate deploy
     ```
   - On Windows (PowerShell):
     ```powershell
     $env:DATABASE_URL="postgresql://postgres:password@localhost:5432/appointly_test?schema=public"; npx prisma migrate deploy
     ```

### Step 3: Run the Test Suites
```bash
# Run the entire test suite (unit + Supertest + live PostgreSQL concurrency)
npm test

# Run tests in watch mode
npm run test:watch

# Run only the HTTP API E2E test suite (14 cases + 10-client concurrency)
npm run test:e2e

# Run unit tests only
npm run test:unit

# Run tests with code coverage analysis
npm run test:coverage
```

---

## 8. API Reference

All endpoints are mounted under `/api` (and `/api/v1` as alias).

### Summary Table

| Method | Path | Description | Success Status | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/clinics/:clinicId/slots` | Create a slot with `startTime` & `endTime` | `201 Created` | `400`, `404`, `409` |
| `GET` | `/api/clinics/:clinicId/slots` | List clinic slots (`status`, `from`, `to`) | `200 OK` | `400`, `404` |
| `DELETE` | `/api/slots/:slotId` | Cancel an appointment slot | `200 OK` | `404`, `409` |
| `POST` | `/api/slots/:slotId/bookings` | Book an available slot for a patient | `201 Created` | `400`, `404`, `409` |
| `DELETE` | `/api/bookings/:bookingId` | Cancel an active booking and reopen slot | `200 OK` | `404`, `409` |

---

### Detailed Endpoints

#### 1. POST /api/clinics/:clinicId/slots
Publish an appointment slot for a clinic.
- **Path Parameters**:
  - `clinicId` (string, UUID, required)
- **Request Body**:
  ```json
  {
    "startTime": "2026-11-01T09:00:00.000Z",
    "endTime": "2026-11-01T10:00:00.000Z"
  }
  ```
- **Success Response (`201 Created`)**:
  ```json
  {
    "status": "success",
    "data": {
      "id": "c1f2b3e4-5678-90ab-cdef-1234567890ab",
      "clinicId": "123e4567-e89b-12d3-a456-426614174000",
      "startTime": "2026-11-01T09:00:00.000Z",
      "endTime": "2026-11-01T10:00:00.000Z",
      "status": "AVAILABLE",
      "createdAt": "2026-10-22T10:00:00.000Z",
      "updatedAt": "2026-10-22T10:00:00.000Z"
    }
  }
  ```

#### 2. GET /api/clinics/:clinicId/slots
List slots published by a clinic.
- **Path Parameters**:
  - `clinicId` (string, UUID, required)
- **Query Parameters (Optional)**:
  - `status`: `AVAILABLE` | `BOOKED` | `CANCELLED`
  - `from`: ISO 8601 datetime string (filter slots with `startTime >= from`)
  - `to`: ISO 8601 datetime string (filter slots with `endTime <= to`)
- **Success Response (`200 OK`)**:
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": "c1f2b3e4-5678-90ab-cdef-1234567890ab",
        "clinicId": "123e4567-e89b-12d3-a456-426614174000",
        "startTime": "2026-11-01T09:00:00.000Z",
        "endTime": "2026-11-01T10:00:00.000Z",
        "status": "AVAILABLE",
        "createdAt": "2026-10-22T10:00:00.000Z",
        "updatedAt": "2026-10-22T10:00:00.000Z",
        "bookings": []
      }
    ]
  }
  ```

#### 3. DELETE /api/slots/:slotId
Cancel an appointment slot. Fails with `409 Conflict` if the slot has an active booking.
- **Path Parameters**:
  - `slotId` (string, UUID, required)
- **Success Response (`200 OK`)**:
  ```json
  {
    "status": "success",
    "message": "Slot successfully cancelled",
    "data": {
      "id": "c1f2b3e4-5678-90ab-cdef-1234567890ab",
      "clinicId": "123e4567-e89b-12d3-a456-426614174000",
      "startTime": "2026-11-01T09:00:00.000Z",
      "endTime": "2026-11-01T10:00:00.000Z",
      "status": "CANCELLED",
      "createdAt": "2026-10-22T10:00:00.000Z",
      "updatedAt": "2026-10-22T10:05:00.000Z"
    }
  }
  ```

#### 4. POST /api/slots/:slotId/bookings
Book an available slot for a patient.
- **Path Parameters**:
  - `slotId` (string, UUID, required)
- **Request Body**:
  ```json
  {
    "patientId": "e5f6a7b8-9012-34cd-ef56-789012345678"
  }
  ```
- **Success Response (`201 Created`)**:
  ```json
  {
    "status": "success",
    "data": {
      "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      "slotId": "c1f2b3e4-5678-90ab-cdef-1234567890ab",
      "patientId": "e5f6a7b8-9012-34cd-ef56-789012345678",
      "status": "CONFIRMED",
      "createdAt": "2026-10-22T10:10:00.000Z",
      "updatedAt": "2026-10-22T10:10:00.000Z",
      "cancelledAt": null
    }
  }
  ```

#### 5. DELETE /api/bookings/:bookingId
Cancel an active booking. If the slot has not been cancelled by the clinic, it is reopened to `AVAILABLE`.
- **Path Parameters**:
  - `bookingId` (string, UUID, required)
- **Success Response (`200 OK`)**:
  ```json
  {
    "status": "success",
    "message": "Booking successfully cancelled and slot reopened (if not cancelled)",
    "data": {
      "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      "slotId": "c1f2b3e4-5678-90ab-cdef-1234567890ab",
      "patientId": "e5f6a7b8-9012-34cd-ef56-789012345678",
      "status": "CANCELLED",
      "createdAt": "2026-10-22T10:10:00.000Z",
      "updatedAt": "2026-10-22T10:15:00.000Z",
      "cancelledAt": "2026-10-22T10:15:00.000Z"
    }
  }
  ```

---

## 9. Copyable cURL Examples

Replace IDs with actual values generated during your session.

### 1. Create Clinic & Patient (Helper Endpoints)
```bash
# Create a clinic
curl -s -X POST http://localhost:3000/api/clinics \
  -H "Content-Type: application/json" \
  -d '{"name": "Central Health Center"}'

# Create a patient
curl -s -X POST http://localhost:3000/api/patients \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice Smith", "email": "alice@example.com"}'
```

### 2. Publish an Appointment Slot
```bash
curl -s -X POST http://localhost:3000/api/clinics/123e4567-e89b-12d3-a456-426614174000/slots \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": "2026-11-01T09:00:00.000Z",
    "endTime": "2026-11-01T10:00:00.000Z"
  }'
```

### 3. List Slots for a Clinic with Filters
```bash
curl -s -X GET "http://localhost:3000/api/clinics/123e4567-e89b-12d3-a456-426614174000/slots?status=AVAILABLE&from=2026-11-01T00:00:00.000Z&to=2026-11-30T23:59:59.000Z"
```

### 4. Book an Available Slot
```bash
curl -s -X POST http://localhost:3000/api/slots/c1f2b3e4-5678-90ab-cdef-1234567890ab/bookings \
  -H "Content-Type: application/json" \
  -d '{"patientId": "e5f6a7b8-9012-34cd-ef56-789012345678"}'
```

### 5. Cancel an Active Booking (Reopens Slot)
```bash
curl -s -X DELETE http://localhost:3000/api/bookings/b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22
```

### 6. Cancel an Appointment Slot
```bash
curl -s -X DELETE http://localhost:3000/api/slots/c1f2b3e4-5678-90ab-cdef-1234567890ab
```

---

## 10. Example Error Responses

All error responses return a standardized, machine-readable envelope without exposing stack traces.

### 400 Bad Request (Validation Error)
Triggered when input schema validation fails (e.g., `startTime` in the past, or `startTime >= endTime`):
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "startTime",
        "message": "startTime must be in the future",
        "code": "custom"
      }
    ]
  }
}
```

### 404 Not Found
Triggered when the requested resource ID does not exist:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Slot with id 00000000-0000-0000-0000-000000000000 not found"
  }
}
```

### 409 Conflict
Triggered under invalid business state transitions or concurrency conflicts:

- **Slot already booked**:
  ```json
  {
    "error": {
      "code": "SLOT_UNAVAILABLE",
      "message": "This slot is already booked."
    }
  }
  ```
- **Slot cancelled**:
  ```json
  {
    "error": {
      "code": "SLOT_CANCELLED",
      "message": "Slot has been cancelled and cannot be booked"
    }
  }
  ```
- **Attempting to cancel a slot with an active booking**:
  ```json
  {
    "error": {
      "code": "SLOT_HAS_ACTIVE_BOOKING",
      "message": "A slot with an active booking cannot be cancelled. The booking must be cancelled first."
    }
  }
  ```
- **Booking already cancelled**:
  ```json
  {
    "error": {
      "code": "BOOKING_ALREADY_CANCELLED",
      "message": "Booking is already cancelled"
    }
  }
  ```
- **Publishing an overlapping slot for the same clinic**:
  ```json
  {
    "error": {
      "code": "SLOT_OVERLAP",
      "message": "An active slot already exists for this clinic overlapping with the specified time range."
    }
  }
  ```

---

## 11. Assumptions & Limitations

1. **Authentication & Authorization**: Explicitly omitted as per the assignment scope. Any client can act on behalf of any `clinicId` or `patientId`. In a full production application, this would be guarded by JWT/OAuth2 tokens and RBAC middleware.
2. **Timezone Standardization**: All timestamps are parsed, validated, stored, and returned in UTC (`ISO 8601`).
3. **Database Dependency**: Concurrency guarantees rely on PostgreSQL features (`SELECT ... FOR UPDATE`, row-level locking, and `btree_gist` exclusion constraints).
4. **Soft Deletions**: Slots and bookings are not hard-deleted (`DROP`/`DELETE FROM`) during regular clinic workflows; they transition to `CANCELLED` status to preserve audit trails.

---

## 12. Automated Testing & Concurrency Verification

The test suite contains **72 automated tests across 8 test files**, executed against both Supertest HTTP interfaces and the real PostgreSQL test database.

### The 10-Client Concurrent Booking Test (`Case 12`)
In [`tests/integration/http-e2e.test.ts`](file:///c:/Users/Vedansh/appointly/tests/integration/http-e2e.test.ts), the concurrency test verifies true parallel execution:
1. Creates a single `AVAILABLE` slot.
2. Creates 10 distinct patient records in PostgreSQL.
3. Fires 10 HTTP requests concurrently over Supertest using `Promise.all`:
   ```ts
   const bookingPromises = patients.map((patient) =>
     request(app).post(`/api/slots/${slot.id}/bookings`).send({ patientId: patient.id })
   );
   const responses = await Promise.all(bookingPromises);
   ```
4. **Assertions**:
   - Exactly **one request** receives `201 Created`.
   - Exactly **nine requests** receive `409 Conflict` with code `SLOT_UNAVAILABLE`.
   - Direct database inspection confirms **exactly one active (`CONFIRMED`) booking** exists for the slot, and the slot's persisted status is `BOOKED`.

### Complete Test Results
```
Test Files  8 passed (8)
     Tests  76 passed (76)
  Duration  76.28s
```
- `tests/unit/validation.test.ts`: 16 passed
- `tests/unit/error-handler.test.ts`: 6 passed
- `tests/unit/slot-service.test.ts`: 4 passed
- `tests/unit/booking-service.test.ts`: 9 passed
- `tests/integration/health.test.ts`: 3 passed
- `tests/integration/api-routes.test.ts`: 15 passed
- `tests/integration/db-e2e.test.ts`: 8 passed
- `tests/integration/http-e2e.test.ts`: 15 passed (including Case 15 regression test)

---

## 13. Git Submission Commands

To commit the completed implementation and push it to a new remote repository:

```bash
# 1. Inspect status to confirm only clean, non-secret files are staged
git status

# 2. Add all tracked project files (honoring .gitignore)
git add .

# 3. Create the commit
git commit -m "feat: complete production-grade clinic appointment booking API with concurrency controls"

# 4. (When authorized) Link to your new GitHub repository:
# git remote add origin https://github.com/<your-username>/<your-repo-name>.git

# 5. Push to main:
# git branch -M main
# git push -u origin main
```