import { z } from "zod";

export const createClinicSchema = z.object({
  name: z.string().trim().min(1, "Clinic name is required").max(255, "Clinic name too long"),
});

export const clinicIdParamSchema = z.object({
  clinicId: z.string().uuid("Invalid clinic ID format"),
});

export type CreateClinicInput = z.infer<typeof createClinicSchema>;
