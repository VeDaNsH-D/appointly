import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlotStatus, BookingStatus } from "@prisma/client";
import { bookingService } from "../../src/services/booking.service";
import { prisma } from "../../src/lib/prisma";
import { ConflictError, NotFoundError } from "../../src/errors/app-error";

vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    patient: {
      findUnique: vi.fn(),
    },
    slot: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    booking: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

describe("BookingService", () => {
  const mockPatient = {
    id: "patient-1",
    name: "John Doe",
    email: "john@example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAvailableSlot = {
    id: "slot-1",
    clinicId: "clinic-1",
    startTime: new Date(),
    endTime: new Date(),
    status: SlotStatus.AVAILABLE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("bookSlot", () => {
    it("should successfully book an available slot using row-level locking", async () => {
      vi.mocked(prisma.patient.findUnique).mockResolvedValue(mockPatient as any);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([mockAvailableSlot]);
      vi.mocked(prisma.booking.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.slot.update).mockResolvedValue({
        ...mockAvailableSlot,
        status: SlotStatus.BOOKED,
      } as any);
      vi.mocked(prisma.booking.create).mockResolvedValue({
        id: "booking-1",
        slotId: "slot-1",
        patientId: "patient-1",
        status: BookingStatus.CONFIRMED,
        createdAt: new Date(),
        updatedAt: new Date(),
        cancelledAt: null,
      } as any);

      const result = await bookingService.bookSlot("slot-1", "patient-1");

      expect(result.status).toBe(BookingStatus.CONFIRMED);
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.slot.update).toHaveBeenCalledWith({
        where: { id: "slot-1" },
        data: { status: SlotStatus.BOOKED },
      });
      expect(prisma.booking.create).toHaveBeenCalledWith({
        data: {
          slotId: "slot-1",
          patientId: "patient-1",
          status: BookingStatus.CONFIRMED,
        },
        include: {
          slot: { include: { clinic: true } },
          patient: true,
        },
      });
    });

    it("should reject booking if patient does not exist", async () => {
      vi.mocked(prisma.patient.findUnique).mockResolvedValue(null);

      await expect(
        bookingService.bookSlot("slot-1", "non-existent-patient")
      ).rejects.toThrow(NotFoundError);
    });

    it("should reject booking if slot does not exist", async () => {
      vi.mocked(prisma.patient.findUnique).mockResolvedValue(mockPatient as any);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

      await expect(
        bookingService.bookSlot("non-existent-slot", "patient-1")
      ).rejects.toThrow(NotFoundError);
    });

    it("should reject booking if slot is cancelled", async () => {
      vi.mocked(prisma.patient.findUnique).mockResolvedValue(mockPatient as any);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { ...mockAvailableSlot, status: SlotStatus.CANCELLED },
      ]);

      await expect(
        bookingService.bookSlot("slot-1", "patient-1")
      ).rejects.toThrow(ConflictError);
      await expect(
        bookingService.bookSlot("slot-1", "patient-1")
      ).rejects.toThrow("Slot has been cancelled and cannot be booked");
    });

    it("should reject booking if slot is already booked", async () => {
      vi.mocked(prisma.patient.findUnique).mockResolvedValue(mockPatient as any);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { ...mockAvailableSlot, status: SlotStatus.BOOKED },
      ]);

      await expect(
        bookingService.bookSlot("slot-1", "patient-1")
      ).rejects.toThrow(ConflictError);
      await expect(
        bookingService.bookSlot("slot-1", "patient-1")
      ).rejects.toThrow("This slot is already booked.");
    });

    it("concurrency safety: serialized execution prevents concurrent booking collision", async () => {
      vi.mocked(prisma.patient.findUnique).mockResolvedValue(mockPatient as any);

      // Request 1 acquires lock on AVAILABLE slot
      // Request 2 acquires lock after Request 1 updates it to BOOKED
      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([mockAvailableSlot])
        .mockResolvedValueOnce([{ ...mockAvailableSlot, status: SlotStatus.BOOKED }]);

      vi.mocked(prisma.booking.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.slot.update).mockResolvedValue({
        ...mockAvailableSlot,
        status: SlotStatus.BOOKED,
      } as any);
      vi.mocked(prisma.booking.create).mockResolvedValue({
        id: "booking-1",
        slotId: "slot-1",
        patientId: "patient-1",
        status: BookingStatus.CONFIRMED,
      } as any);

      const request1 = bookingService.bookSlot("slot-1", "patient-1");
      const request2 = bookingService.bookSlot("slot-1", "patient-1");

      const results = await Promise.allSettled([request1, request2]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectionReason).toBeInstanceOf(ConflictError);
      expect(rejectionReason.message).toBe("This slot is already booked.");
    });
  });

  describe("cancelBooking", () => {
    it("should cancel active booking and reopen the slot if slot was not cancelled", async () => {
      const activeBooking = {
        id: "booking-1",
        slotId: "slot-1",
        patientId: "patient-1",
        status: BookingStatus.CONFIRMED,
      };

      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([activeBooking]) // booking query
        .mockResolvedValueOnce([{ id: "slot-1", status: SlotStatus.BOOKED }]); // slot query

      vi.mocked(prisma.booking.update).mockResolvedValue({
        ...activeBooking,
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
      } as any);

      const result = await bookingService.cancelBooking("booking-1");

      expect(result.status).toBe(BookingStatus.CANCELLED);
      // Reopens slot because slot was not CANCELLED
      expect(prisma.slot.update).toHaveBeenCalledWith({
        where: { id: "slot-1" },
        data: { status: SlotStatus.AVAILABLE },
      });
    });

    it("should cancel booking but NOT reopen slot if slot was cancelled by clinic", async () => {
      const bookingOnCancelledSlot = {
        id: "booking-1",
        slotId: "slot-1",
        patientId: "patient-1",
        status: BookingStatus.CONFIRMED,
      };

      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([bookingOnCancelledSlot]) // booking query
        .mockResolvedValueOnce([{ id: "slot-1", status: SlotStatus.CANCELLED }]); // slot query

      vi.mocked(prisma.booking.update).mockResolvedValue({
        ...bookingOnCancelledSlot,
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
      } as any);

      await bookingService.cancelBooking("booking-1");

      // Slot should NOT be reopened to AVAILABLE
      expect(prisma.slot.update).not.toHaveBeenCalled();
    });

    it("should reject cancelling an already cancelled booking with ConflictError", async () => {
      const alreadyCancelledBooking = {
        id: "booking-1",
        slotId: "slot-1",
        patientId: "patient-1",
        status: BookingStatus.CANCELLED,
      };

      vi.mocked(prisma.$queryRaw).mockResolvedValue([alreadyCancelledBooking]);

      await expect(bookingService.cancelBooking("booking-1")).rejects.toThrow(
        ConflictError
      );
      await expect(bookingService.cancelBooking("booking-1")).rejects.toThrow(
        "Booking is already cancelled"
      );
    });
  });
});
