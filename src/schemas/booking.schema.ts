import { z } from "zod";

export const createBookingBodySchema = z.object({
  patientId: z.string({ required_error: "patientId is required" }).uuid("Invalid patient ID format"),
  slotId: z.string().uuid("Invalid slot ID format").optional(),
});

export const bookSlotParamSchema = z.object({
  slotId: z.string().uuid("Invalid slot ID format"),
});

export const bookingIdParamSchema = z.object({
  bookingId: z.string().uuid("Invalid booking ID format"),
});

export type CreateBookingInput = z.infer<typeof createBookingBodySchema>;
