import { z } from "zod";

export const createPatientSchema = z.object({
  name: z.string().trim().min(1, "Patient name is required").max(255, "Patient name too long"),
  email: z.string().email("Invalid email address").optional(),
});

export const patientIdParamSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID format"),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
