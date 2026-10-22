import { describe, it, expect } from "vitest";
import { createClinicSchema, clinicIdParamSchema } from "../../src/schemas/clinic.schema";
import {
  publishSlotBodySchema,
  slotIdParamSchema,
  querySlotsSchema,
} from "../../src/schemas/slot.schema";
import { createBookingBodySchema, bookingIdParamSchema } from "../../src/schemas/booking.schema";

describe("Validation Schemas", () => {
  describe("Clinic Schemas", () => {
    it("should accept valid clinic creation payload", () => {
      const result = createClinicSchema.safeParse({ name: "Downtown Health Clinic" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Downtown Health Clinic");
      }
    });

    it("should reject empty clinic name", () => {
      const result = createClinicSchema.safeParse({ name: "   " });
      expect(result.success).toBe(false);
    });

    it("should reject missing clinic name", () => {
      const result = createClinicSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should validate valid UUID for clinicId param", () => {
      const result = clinicIdParamSchema.safeParse({
        clinicId: "123e4567-e89b-12d3-a456-426614174000",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid UUID for clinicId param", () => {
      const result = clinicIdParamSchema.safeParse({ clinicId: "invalid-uuid" });
      expect(result.success).toBe(false);
    });
  });

  describe("Slot Schemas", () => {
    it("should accept valid start and end times where endTime > startTime", () => {
      const result = publishSlotBodySchema.safeParse({
        startTime: "2026-11-01T09:00:00.000Z",
        endTime: "2026-11-01T10:00:00.000Z",
      });
      expect(result.success).toBe(true);
    });

    it("should reject when endTime is earlier than startTime", () => {
      const result = publishSlotBodySchema.safeParse({
        startTime: "2026-11-01T10:00:00.000Z",
        endTime: "2026-11-01T09:00:00.000Z",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "endTime must be strictly after startTime"
        );
      }
    });

    it("should reject when endTime is equal to startTime", () => {
      const result = publishSlotBodySchema.safeParse({
        startTime: "2026-11-01T10:00:00.000Z",
        endTime: "2026-11-01T10:00:00.000Z",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "endTime must be strictly after startTime"
        );
      }
    });

    it("should reject non-ISO datetime formats", () => {
      const result = publishSlotBodySchema.safeParse({
        startTime: "01-11-2026 09:00",
        endTime: "01-11-2026 10:00",
      });
      expect(result.success).toBe(false);
    });

    it("should reject startTime in the past", () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const futureEndTime = new Date(Date.now() + 3600000).toISOString();
      const result = publishSlotBodySchema.safeParse({
        startTime: pastTime,
        endTime: futureEndTime,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("startTime must be in the future");
      }
    });

    it("should validate slotId param UUID", () => {
      const result = slotIdParamSchema.safeParse({
        slotId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      });
      expect(result.success).toBe(true);
    });

    it("should validate querySlotsSchema with from and to filters", () => {
      const validQuery = {
        from: "2026-11-01T00:00:00.000Z",
        to: "2026-11-30T23:59:59.000Z",
        status: "AVAILABLE",
      };
      const result = querySlotsSchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it("should reject querySlotsSchema when 'to' is earlier than 'from'", () => {
      const invalidQuery = {
        from: "2026-11-30T00:00:00.000Z",
        to: "2026-11-01T00:00:00.000Z",
      };
      const result = querySlotsSchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });
  });

  describe("Booking Schemas", () => {
    it("should accept valid booking payload", () => {
      const result = createBookingBodySchema.safeParse({
        patientId: "123e4567-e89b-12d3-a456-426614174000",
        slotId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      });
      expect(result.success).toBe(true);
    });

    it("should reject booking with invalid patientId UUID", () => {
      const result = createBookingBodySchema.safeParse({
        patientId: "invalid-id",
      });
      expect(result.success).toBe(false);
    });

    it("should validate bookingId param UUID", () => {
      const valid = bookingIdParamSchema.safeParse({
        bookingId: "123e4567-e89b-12d3-a456-426614174000",
      });
      expect(valid.success).toBe(true);

      const invalid = bookingIdParamSchema.safeParse({
        bookingId: "not-a-uuid",
      });
      expect(invalid.success).toBe(false);
    });
  });
});
