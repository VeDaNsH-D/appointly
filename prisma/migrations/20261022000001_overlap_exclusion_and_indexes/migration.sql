-- Enable btree_gist extension for PostgreSQL exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Enforce at database engine level: active (non-cancelled) slots for the same clinic must never overlap
ALTER TABLE "slots" ADD CONSTRAINT "no_overlapping_active_slots"
EXCLUDE USING gist (
  "clinicId" WITH =,
  tsrange("startTime", "endTime") WITH &&
) WHERE ("status" != 'CANCELLED');
