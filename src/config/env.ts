import dotenv from "dotenv";
import { z } from "zod";

if (process.env.NODE_ENV === "test") {
  dotenv.config({ path: ".env.test", override: true });
} else {
  dotenv.config();
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive().max(65535))
    .default("3000"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment variables:", parsedEnv.error.format());
  throw new Error("Invalid environment configuration");
}

export const env = parsedEnv.data;
