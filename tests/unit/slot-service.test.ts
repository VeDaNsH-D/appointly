import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlotStatus, BookingStatus } from "@prisma/client";
import { slotService } from "../../src/services/slot.service";
import { prisma } from "../../src/lib/prisma";
import { ConflictError, NotFoundError } from "../../src/errors/app-error";

vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    clinic: {
      findUnique: vi.fn(),
    },
    slot: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    booking: {
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

describe("SlotService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("cancelSlot", () => {
    it("should reject cancelling a slot that does not exist with NotFoundError", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

      await expect(
        slotService.cancelSlot("123e4567-e89b-12d3-a456-426614174000")
      ).rejects.toThrow(NotFoundError);
    });

    it("should reject cancelling a slot with an active booking with ConflictError", async () => {
      const slotWithActiveBooking = {
        id: "slot-1",
        clinicId: "clinic-1",
        startTime: new Date(),
        endTime: new Date(),
        status: SlotStatus.BOOKED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.$queryRaw).mockResolvedValue([slotWithActiveBooking]);
      vi.mocked(prisma.booking.findFirst).mockResolvedValue({
        id: "booking-1",
        slotId: "slot-1",
        patientId: "patient-1",
        status: BookingStatus.CONFIRMED,
        createdAt: new Date(),
        updatedAt: new Date(),
        cancelledAt: null,
      } as any);

      await expect(slotService.cancelSlot("slot-1")).rejects.toThrow(ConflictError);
      await expect(slotService.cancelSlot("slot-1")).rejects.toThrow(
        "A slot with an active booking cannot be cancelled"
      );
    });

    it("should reject cancelling an already cancelled slot with ConflictError", async () => {
      const alreadyCancelledSlot = {
        id: "slot-1",
        clinicId: "clinic-1",
        startTime: new Date(),
        endTime: new Date(),
        status: SlotStatus.CANCELLED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.$queryRaw).mockResolvedValue([alreadyCancelledSlot]);

      await expect(slotService.cancelSlot("slot-1")).rejects.toThrow(ConflictError);
      await expect(slotService.cancelSlot("slot-1")).rejects.toThrow(
        "Slot is already cancelled"
      );
    });

    it("should successfully cancel an available slot without bookings", async () => {
      const availableSlot = {
        id: "slot-1",
        clinicId: "clinic-1",
        startTime: new Date(),
        endTime: new Date(),
        status: SlotStatus.AVAILABLE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.$queryRaw).mockResolvedValue([availableSlot]);
      vi.mocked(prisma.booking.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.slot.update).mockResolvedValue({
        ...availableSlot,
        status: SlotStatus.CANCELLED,
      } as any);

      const result = await slotService.cancelSlot("slot-1");
      expect(result.status).toBe(SlotStatus.CANCELLED);
      expect(prisma.slot.update).toHaveBeenCalledWith({
        where: { id: "slot-1" },
        data: { status: SlotStatus.CANCELLED },
      });
    });
  });
});
