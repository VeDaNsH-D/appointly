import { z } from "zod";

export const publishSlotBodySchema = z
  .object({
    startTime: z
      .string({ required_error: "startTime is required" })
      .datetime({ message: "startTime must be a valid ISO 8601 datetime string" }),
    endTime: z
      .string({ required_error: "endTime is required" })
      .datetime({ message: "endTime must be a valid ISO 8601 datetime string" }),
  })
  .refine(
    (data) => new Date(data.endTime) > new Date(data.startTime),
    {
      message: "endTime must be strictly after startTime",
      path: ["endTime"],
    }
  )
  .refine(
    (data) => new Date(data.startTime).getTime() > Date.now(),
    {
      message: "startTime must be in the future",
      path: ["startTime"],
    }
  );

export const slotClinicParamsSchema = z.object({
  clinicId: z.string().uuid("Invalid clinic ID format"),
});

export const slotIdParamSchema = z.object({
  slotId: z.string().uuid("Invalid slot ID format"),
});

export const querySlotsSchema = z
  .object({
    status: z.enum(["AVAILABLE", "BOOKED", "CANCELLED"]).optional(),
    from: z
      .string()
      .datetime({ message: "'from' must be a valid ISO 8601 datetime string" })
      .optional(),
    to: z
      .string()
      .datetime({ message: "'to' must be a valid ISO 8601 datetime string" })
      .optional(),
    startDate: z
      .string()
      .datetime({ message: "'startDate' must be a valid ISO 8601 datetime string" })
      .optional(),
    endDate: z
      .string()
      .datetime({ message: "'endDate' must be a valid ISO 8601 datetime string" })
      .optional(),
  })
  .refine(
    (data) => {
      const from = data.from || data.startDate;
      const to = data.to || data.endDate;
      if (from && to) {
        return new Date(to) >= new Date(from);
      }
      return true;
    },
    {
      message: "'to' datetime must not be earlier than 'from' datetime",
      path: ["to"],
    }
  );

export type PublishSlotInput = z.infer<typeof publishSlotBodySchema>;
export type QuerySlotsInput = z.infer<typeof querySlotsSchema>;
