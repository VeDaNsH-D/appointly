import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { SlotStatus, BookingStatus } from "@prisma/client";

vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    clinic: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    patient: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    slot: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    booking: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

describe("API Endpoints Integration (Supertest)", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validClinicId = "123e4567-e89b-12d3-a456-426614174000";
  const validSlotId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const validBookingId = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
  const validPatientId = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";

  describe("Endpoint 1: POST /api/clinics/:clinicId/slots", () => {
    it("should successfully create a slot with 201 Created", async () => {
      vi.mocked(prisma.clinic.findUnique).mockResolvedValue({
        id: validClinicId,
        name: "Main Health",
      } as any);
      vi.mocked(prisma.slot.findFirst).mockResolvedValue(null);

      const mockSlot = {
        id: validSlotId,
        clinicId: validClinicId,
        startTime: new Date("2026-11-01T09:00:00.000Z"),
        endTime: new Date("2026-11-01T10:00:00.000Z"),
        status: SlotStatus.AVAILABLE,
      };
      vi.mocked(prisma.slot.create).mockResolvedValue(mockSlot as any);

      const res = await request(app)
        .post(`/api/clinics/${validClinicId}/slots`)
        .send({
          startTime: "2026-11-01T09:00:00.000Z",
          endTime: "2026-11-01T10:00:00.000Z",
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.id).toBe(validSlotId);
    });

    it("should return 400 for endTime before startTime", async () => {
      const res = await request(app)
        .post(`/api/clinics/${validClinicId}/slots`)
        .send({
          startTime: "2026-11-01T12:00:00.000Z",
          endTime: "2026-11-01T10:00:00.000Z",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for startTime in the past", async () => {
      const pastStart = new Date(Date.now() - 3600000).toISOString();
      const futureEnd = new Date(Date.now() + 3600000).toISOString();

      const res = await request(app)
        .post(`/api/clinics/${validClinicId}/slots`)
        .send({
          startTime: pastStart,
          endTime: futureEnd,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Endpoint 2: GET /api/clinics/:clinicId/slots", () => {
    it("should list slots with 200 and support from/to/status filters", async () => {
      vi.mocked(prisma.clinic.findUnique).mockResolvedValue({
        id: validClinicId,
        name: "Main Health",
      } as any);
      vi.mocked(prisma.slot.findMany).mockResolvedValue([
        {
          id: validSlotId,
          clinicId: validClinicId,
          startTime: new Date("2026-11-01T09:00:00.000Z"),
          endTime: new Date("2026-11-01T10:00:00.000Z"),
          status: SlotStatus.AVAILABLE,
          bookings: [],
        } as any,
      ]);

      const res = await request(app)
        .get(`/api/clinics/${validClinicId}/slots`)
        .query({
          status: "AVAILABLE",
          from: "2026-11-01T00:00:00.000Z",
          to: "2026-11-30T23:59:59.000Z",
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("should return 400 when 'to' is earlier than 'from'", async () => {
      const res = await request(app)
        .get(`/api/clinics/${validClinicId}/slots`)
        .query({
          from: "2026-11-30T00:00:00.000Z",
          to: "2026-11-01T00:00:00.000Z",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Endpoint 3: DELETE /api/slots/:slotId", () => {
    it("should cancel slot and return 200 OK", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          id: validSlotId,
          status: SlotStatus.AVAILABLE,
        },
      ]);
      vi.mocked(prisma.booking.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.slot.update).mockResolvedValue({
        id: validSlotId,
        status: SlotStatus.CANCELLED,
      } as any);

      const res = await request(app).delete(`/api/slots/${validSlotId}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.status).toBe(SlotStatus.CANCELLED);
    });

    it("should return 409 Conflict if slot has an active booking", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          id: validSlotId,
          status: SlotStatus.BOOKED,
        },
      ]);
      vi.mocked(prisma.booking.findFirst).mockResolvedValue({
        id: validBookingId,
        slotId: validSlotId,
        status: BookingStatus.CONFIRMED,
      } as any);

      const res = await request(app).delete(`/api/slots/${validSlotId}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("SLOT_HAS_ACTIVE_BOOKING");
    });
  });

  describe("Endpoint 4: POST /api/slots/:slotId/bookings", () => {
    it("should book available slot with 201 Created", async () => {
      vi.mocked(prisma.patient.findUnique).mockResolvedValue({
        id: validPatientId,
        name: "Jane Doe",
      } as any);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          id: validSlotId,
          status: SlotStatus.AVAILABLE,
        },
      ]);
      vi.mocked(prisma.booking.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.slot.update).mockResolvedValue({} as any);
      vi.mocked(prisma.booking.create).mockResolvedValue({
        id: validBookingId,
        slotId: validSlotId,
        patientId: validPatientId,
        status: BookingStatus.CONFIRMED,
      } as any);

      const res = await request(app)
        .post(`/api/slots/${validSlotId}/bookings`)
        .send({ patientId: validPatientId });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.status).toBe(BookingStatus.CONFIRMED);
    });

    it("should return 409 Conflict if slot is already booked", async () => {
      vi.mocked(prisma.patient.findUnique).mockResolvedValue({
        id: validPatientId,
      } as any);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          id: validSlotId,
          status: SlotStatus.BOOKED,
        },
      ]);

      const res = await request(app)
        .post(`/api/slots/${validSlotId}/bookings`)
        .send({ patientId: validPatientId });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("SLOT_UNAVAILABLE");
    });
  });

  describe("Endpoint 5: DELETE /api/bookings/:bookingId", () => {
    it("should cancel active booking and return 200 OK", async () => {
      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([
          { id: validBookingId, slotId: validSlotId, status: BookingStatus.CONFIRMED },
        ])
        .mockResolvedValueOnce([{ id: validSlotId, status: SlotStatus.BOOKED }]);

      vi.mocked(prisma.booking.update).mockResolvedValue({
        id: validBookingId,
        status: BookingStatus.CANCELLED,
      } as any);
      vi.mocked(prisma.slot.update).mockResolvedValue({} as any);

      const res = await request(app).delete(`/api/bookings/${validBookingId}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.status).toBe(BookingStatus.CANCELLED);
    });

    it("should return 409 Conflict if booking is already cancelled", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        { id: validBookingId, slotId: validSlotId, status: BookingStatus.CANCELLED },
      ]);

      const res = await request(app).delete(`/api/bookings/${validBookingId}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("BOOKING_ALREADY_CANCELLED");
    });

    it("should return 404 Not Found if booking does not exist", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]);

      const res = await request(app).delete(`/api/bookings/${validBookingId}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("Malformed Input & Edge Cases", () => {
    it("should reject malformed raw JSON body with 400 INVALID_JSON", async () => {
      const res = await request(app)
        .post("/api/clinics")
        .set("Content-Type", "application/json")
        .send("{ malformed: json, syntax-error ");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_JSON");
      expect(res.body.error.message).toBe("Malformed JSON payload in request body");
    });

    it("should reject non-UUID slotId param with 400 VALIDATION_ERROR", async () => {
      const res = await request(app).get("/api/slots/not-a-valid-uuid");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject non-UUID bookingId param with 400 VALIDATION_ERROR", async () => {
      const res = await request(app).delete("/api/bookings/123-abc-invalid");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
