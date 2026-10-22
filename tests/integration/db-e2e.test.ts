import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { slotService } from "../../src/services/slot.service";
import { bookingService } from "../../src/services/booking.service";
import { ConflictError } from "../../src/errors/app-error";
import { SlotStatus, BookingStatus } from "@prisma/client";

describe("Live PostgreSQL Database & Concurrency E2E Tests", { timeout: 60000 }, () => {
  let clinicId: string;
  let patientId: string;
  let patient2Id: string;
  let slotId: string;

  beforeAll(async () => {
    // Setup test clinic & patients in real database
    const clinic = await prisma.clinic.create({
      data: { name: "E2E Test Medical Center" },
    });
    clinicId = clinic.id;

    const patient1 = await prisma.patient.create({
      data: { name: "E2E Test Patient Alpha", email: "alpha@test.com" },
    });
    patientId = patient1.id;

    const patient2 = await prisma.patient.create({
      data: { name: "E2E Test Patient Beta", email: "beta@test.com" },
    });
    patient2Id = patient2.id;
  });

  afterAll(async () => {
    // Teardown created records
    try {
      if (clinicId) {
        await prisma.clinic.delete({ where: { id: clinicId } });
      }
      if (patientId) {
        await prisma.patient.delete({ where: { id: patientId } });
      }
      if (patient2Id) {
        await prisma.patient.delete({ where: { id: patient2Id } });
      }
    } catch (err) {
      // Ignore cleanup error if cascade deleted
    }
    await prisma.$disconnect();
  });

  it("1. Should publish a slot in the real database", async () => {
    const startTime = new Date(Date.now() + 86400000).toISOString(); // +24 hours
    const endTime = new Date(Date.now() + 90000000).toISOString(); // +25 hours

    const slot = await slotService.publishSlot(clinicId, {
      startTime,
      endTime,
    });

    expect(slot).toBeDefined();
    expect(slot.clinicId).toBe(clinicId);
    expect(slot.status).toBe(SlotStatus.AVAILABLE);
    slotId = slot.id;
  });

  it("2. Should reject publishing an overlapping slot (application & DB exclusion constraint)", async () => {
    const overlappingStart = new Date(Date.now() + 87000000).toISOString();
    const overlappingEnd = new Date(Date.now() + 89000000).toISOString();

    await expect(
      slotService.publishSlot(clinicId, {
        startTime: overlappingStart,
        endTime: overlappingEnd,
      })
    ).rejects.toThrow(ConflictError);
  });

  it("3. Should successfully book the slot using row-level locking", async () => {
    const booking = await bookingService.bookSlot(slotId, patientId);

    expect(booking).toBeDefined();
    expect(booking.slotId).toBe(slotId);
    expect(booking.patientId).toBe(patientId);
    expect(booking.status).toBe(BookingStatus.CONFIRMED);

    const slotInDb = await prisma.slot.findUnique({ where: { id: slotId } });
    expect(slotInDb?.status).toBe(SlotStatus.BOOKED);
  });

  it("4. Should reject concurrent/duplicate booking on the booked slot with ConflictError", async () => {
    await expect(
      bookingService.bookSlot(slotId, patient2Id)
    ).rejects.toThrow(ConflictError);
  });

  it("5. Should reject cancelling a slot that has an active booking with 409", async () => {
    await expect(slotService.cancelSlot(slotId)).rejects.toThrow(ConflictError);
  });

  it("6. Should cancel booking and reopen slot to AVAILABLE", async () => {
    const activeBooking = await prisma.booking.findFirst({
      where: { slotId, status: BookingStatus.CONFIRMED },
    });
    expect(activeBooking).toBeDefined();

    const cancelledBooking = await bookingService.cancelBooking(activeBooking!.id);
    expect(cancelledBooking.status).toBe(BookingStatus.CANCELLED);

    const slotInDb = await prisma.slot.findUnique({ where: { id: slotId } });
    expect(slotInDb?.status).toBe(SlotStatus.AVAILABLE);
  });

  it("7. Should now allow cancelling the reopened slot with no active booking", async () => {
    const cancelledSlot = await slotService.cancelSlot(slotId);
    expect(cancelledSlot.status).toBe(SlotStatus.CANCELLED);

    const slotInDb = await prisma.slot.findUnique({ where: { id: slotId } });
    expect(slotInDb?.status).toBe(SlotStatus.CANCELLED);
  });

  it("8. A cancelled slot must never be bookable", async () => {
    await expect(
      bookingService.bookSlot(slotId, patientId)
    ).rejects.toThrow(ConflictError);
  });
});
