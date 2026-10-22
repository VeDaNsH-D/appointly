import { SlotStatus, BookingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { NotFoundError, ConflictError } from "../errors/app-error";

export class BookingService {
  /**
   * Book an available slot.
   * Concurrency Safe:
   * 1. Uses a PostgreSQL transaction on a single dedicated connection
   * 2. Locks the target slot row using SELECT ... FOR UPDATE before inspecting state
   * 3. Verifies slot exists, is not cancelled, and has no active booking
   * 4. Updates slot to BOOKED and creates CONFIRMED booking atomically
   * 5. Safeguarded by PostgreSQL partial unique index on bookings(slotId) WHERE status = 'CONFIRMED'
   */
  async bookSlot(slotId: string, patientId: string) {
    return prisma.$transaction(async (tx) => {
      // 1. Verify patient exists
      const patient = await tx.patient.findUnique({
        where: { id: patientId },
      });

      if (!patient) {
        throw new NotFoundError(`Patient with id ${patientId} not found`);
      }

      // 2. Lock target slot row with SELECT ... FOR UPDATE
      const lockedSlots = await tx.$queryRaw<Array<{
        id: string;
        clinicId: string;
        startTime: Date;
        endTime: Date;
        status: SlotStatus;
        createdAt: Date;
        updatedAt: Date;
      }>>`SELECT * FROM "slots" WHERE "id" = ${slotId} FOR UPDATE`;

      if (!lockedSlots || lockedSlots.length === 0) {
        throw new NotFoundError(`Slot with id ${slotId} not found`);
      }

      const slot = lockedSlots[0]!;

      // 3. Verify slot state after acquiring exclusive lock
      if (slot.status === SlotStatus.CANCELLED) {
        throw new ConflictError(
          "Slot has been cancelled and cannot be booked",
          "SLOT_CANCELLED"
        );
      }

      if (slot.status === SlotStatus.BOOKED) {
        throw new ConflictError(
          "This slot is already booked.",
          "SLOT_UNAVAILABLE"
        );
      }

      // 4. Double check for any active booking record
      const existingActiveBooking = await tx.booking.findFirst({
        where: {
          slotId,
          status: BookingStatus.CONFIRMED,
        },
      });

      if (existingActiveBooking) {
        throw new ConflictError(
          "This slot is already booked.",
          "SLOT_UNAVAILABLE"
        );
      }

      // 5. Atomically transition slot to BOOKED
      await tx.slot.update({
        where: { id: slotId },
        data: { status: SlotStatus.BOOKED },
      });

      // 6. Create confirmed booking record
      const booking = await tx.booking.create({
        data: {
          slotId,
          patientId,
          status: BookingStatus.CONFIRMED,
        },
        include: {
          slot: {
            include: { clinic: true },
          },
          patient: true,
        },
      });

      return booking;
    }, {
      maxWait: 10000,
      timeout: 20000,
    });
  }

  /**
   * Cancel an active booking.
   * Concurrency Safe:
   * 1. Uses a PostgreSQL transaction
   * 2. Finds booking and verifies not already cancelled
   * 3. Locks target slot row with SELECT ... FOR UPDATE
   * 4. Updates booking to CANCELLED with cancelledAt timestamp
   * 5. Atomically reopens slot to AVAILABLE if and only if slot was not cancelled by clinic
   */
  async cancelBooking(bookingId: string) {
    return prisma.$transaction(async (tx) => {
      // 1. Lock target booking row with SELECT ... FOR UPDATE
      const lockedBookings = await tx.$queryRaw<Array<{
        id: string;
        slotId: string;
        status: BookingStatus;
      }>>`SELECT id, "slotId", status FROM "bookings" WHERE "id" = ${bookingId} FOR UPDATE`;

      if (!lockedBookings || lockedBookings.length === 0) {
        throw new NotFoundError(`Booking with id ${bookingId} not found`);
      }

      const booking = lockedBookings[0]!;

      if (booking.status === BookingStatus.CANCELLED) {
        throw new ConflictError(
          "Booking is already cancelled",
          "BOOKING_ALREADY_CANCELLED"
        );
      }

      // 2. Lock associated slot row using SELECT ... FOR UPDATE
      const lockedSlots = await tx.$queryRaw<Array<{
        id: string;
        status: SlotStatus;
      }>>`SELECT id, status FROM "slots" WHERE "id" = ${booking.slotId} FOR UPDATE`;

      const slot = lockedSlots && lockedSlots.length > 0 ? lockedSlots[0] : null;

      // 4. Mark booking as cancelled
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
        },
        include: {
          slot: true,
          patient: true,
        },
      });

      // 5. Reopen slot ONLY IF slot has not been cancelled by the clinic
      if (slot && slot.status !== SlotStatus.CANCELLED) {
        await tx.slot.update({
          where: { id: booking.slotId },
          data: {
            status: SlotStatus.AVAILABLE,
          },
        });
      }

      return updatedBooking;
    }, {
      maxWait: 10000,
      timeout: 20000,
    });
  }

  /**
   * Get booking details by ID
   */
  async getBookingById(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        slot: {
          include: { clinic: true },
        },
        patient: true,
      },
    });

    if (!booking) {
      throw new NotFoundError(`Booking with id ${bookingId} not found`);
    }

    return booking;
  }

  /**
   * List all bookings for a patient
   */
  async listPatientBookings(patientId: string) {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      throw new NotFoundError(`Patient with id ${patientId} not found`);
    }

    return prisma.booking.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      include: {
        slot: {
          include: { clinic: true },
        },
      },
    });
  }
}

export const bookingService = new BookingService();
