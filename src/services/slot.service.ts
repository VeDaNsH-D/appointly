import { SlotStatus, BookingStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { NotFoundError, ConflictError } from "../errors/app-error";
import { PublishSlotInput, QuerySlotsInput } from "../schemas/slot.schema";

export class SlotService {
  /**
   * Clinics publish appointment slots.
   * Rejects slots in the past, invalid time ranges, and overlapping active slots.
   */
  async publishSlot(clinicId: string, data: PublishSlotInput) {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!clinic) {
      throw new NotFoundError(`Clinic with id ${clinicId} not found`);
    }

    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);

    // Application-level overlap check (backed by PostgreSQL EXCLUDE constraint)
    const overlappingSlot = await prisma.slot.findFirst({
      where: {
        clinicId,
        status: { not: SlotStatus.CANCELLED },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (overlappingSlot) {
      throw new ConflictError(
        "An active slot already exists for this clinic overlapping with the specified time range.",
        "SLOT_OVERLAP"
      );
    }

    return prisma.slot.create({
      data: {
        clinicId,
        startTime,
        endTime,
        status: SlotStatus.AVAILABLE,
      },
    });
  }

  /**
   * Cancel an appointment slot.
   * Rule: A slot with an active booking cannot be cancelled; returns a 409 conflict.
   * Concurrency Safe: Uses SELECT ... FOR UPDATE to lock slot row during inspection and update.
   */
  async cancelSlot(slotId: string) {
    return prisma.$transaction(async (tx) => {
      // 1. Lock slot row with SELECT ... FOR UPDATE
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

      if (slot.status === SlotStatus.CANCELLED) {
        throw new ConflictError("Slot is already cancelled", "SLOT_ALREADY_CANCELLED");
      }

      // 2. Check for active booking
      const activeBooking = await tx.booking.findFirst({
        where: {
          slotId,
          status: BookingStatus.CONFIRMED,
        },
      });

      if (slot.status === SlotStatus.BOOKED || activeBooking) {
        throw new ConflictError(
          "A slot with an active booking cannot be cancelled. The booking must be cancelled first.",
          "SLOT_HAS_ACTIVE_BOOKING"
        );
      }

      // 3. Mark slot as cancelled
      return tx.slot.update({
        where: { id: slotId },
        data: {
          status: SlotStatus.CANCELLED,
        },
      });
    }, {
      maxWait: 10000,
      timeout: 20000,
    });
  }

  /**
   * Get single slot by ID with associated clinic and active booking if present.
   */
  async getSlotById(slotId: string) {
    const slot = await prisma.slot.findUnique({
      where: { id: slotId },
      include: {
        clinic: true,
        bookings: {
          where: { status: BookingStatus.CONFIRMED },
        },
      },
    });

    if (!slot) {
      throw new NotFoundError(`Slot with id ${slotId} not found`);
    }

    return slot;
  }

  /**
   * Query slots for a clinic with optional from, to, and status filters.
   */
  async listClinicSlots(clinicId: string, filter?: QuerySlotsInput) {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!clinic) {
      throw new NotFoundError(`Clinic with id ${clinicId} not found`);
    }

    const where: Prisma.SlotWhereInput = { clinicId };

    if (filter?.status) {
      where.status = filter.status as SlotStatus;
    }

    const fromDate = filter?.from || filter?.startDate;
    const toDate = filter?.to || filter?.endDate;

    if (fromDate) {
      where.startTime = { gte: new Date(fromDate) };
    }

    if (toDate) {
      where.endTime = { lte: new Date(toDate) };
    }

    return prisma.slot.findMany({
      where,
      orderBy: { startTime: "asc" },
      include: {
        bookings: {
          where: { status: BookingStatus.CONFIRMED },
          select: { id: true, patientId: true, status: true, createdAt: true },
        },
      },
    });
  }
}

export const slotService = new SlotService();
