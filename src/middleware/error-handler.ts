import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/app-error";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Handled Domain AppErrors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // 2. Prisma Database Specific Known Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation (e.g. concurrent active booking on the same slot)
    if (err.code === "P2002") {
      res.status(409).json({
        error: {
          code: "SLOT_UNAVAILABLE",
          message: "This slot is already booked.",
        },
      });
      return;
    }

    // Record to update/delete does not exist
    if (err.code === "P2025") {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "The requested resource was not found.",
        },
      });
      return;
    }
  }

  // 3. PostgreSQL Raw or Unknown Request Errors (e.g. exclusion constraint violation)
  if (
    err instanceof Prisma.PrismaClientUnknownRequestError ||
    (err as any)?.code === "23P01" ||
    err.message.includes("no_overlapping_active_slots")
  ) {
    res.status(409).json({
      error: {
        code: "SLOT_OVERLAP",
        message: "An active slot already exists for this clinic overlapping with the specified time range.",
      },
    });
    return;
  }

  // 4. Malformed JSON Body
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Malformed JSON payload in request body",
      },
    });
    return;
  }

  // 5. Uncaught Internal Server Errors (Never expose stack traces to client)
  console.error("Unhandled Error:", err);

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred. Please try again later.",
    },
  });
}
