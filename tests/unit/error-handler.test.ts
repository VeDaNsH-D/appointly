import { describe, it, expect, vi } from "vitest";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "../../src/errors/app-error";
import { errorHandler } from "../../src/middleware/error-handler";

function createMockResponse() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe("Error Handler Middleware", () => {
  const mockReq = {} as Request;
  const mockNext = vi.fn();

  it("should handle custom AppError instances with correct status and error envelope", () => {
    const res = createMockResponse();
    const error = new NotFoundError("Slot not found");

    errorHandler(error, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "NOT_FOUND",
        message: "Slot not found",
      },
    });
  });

  it("should handle ConflictError with 409 and custom code", () => {
    const res = createMockResponse();
    const error = new ConflictError("This slot is already booked.", "SLOT_UNAVAILABLE");

    errorHandler(error, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "SLOT_UNAVAILABLE",
        message: "This slot is already booked.",
      },
    });
  });

  it("should handle Prisma P2002 unique constraint errors with 409 Conflict", () => {
    const res = createMockResponse();
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "6.0.0",
        meta: { target: ["slotId"] },
      }
    );

    errorHandler(prismaError, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "SLOT_UNAVAILABLE",
        message: "This slot is already booked.",
      },
    });
  });

  it("should handle Prisma P2025 record not found errors with 404", () => {
    const res = createMockResponse();
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "Record not found",
      {
        code: "P2025",
        clientVersion: "6.0.0",
      }
    );

    errorHandler(prismaError, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
      },
    });
  });

  it("should handle slot overlap exclusion constraint violations with 409 SLOT_OVERLAP", () => {
    const res = createMockResponse();
    const exclusionError = new Error("conflicting key value violates exclusion constraint \"no_overlapping_active_slots\"");

    errorHandler(exclusionError, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "SLOT_OVERLAP",
        message: "An active slot already exists for this clinic overlapping with the specified time range.",
      },
    });
  });

  it("should handle generic unknown errors with 500 and never expose internals", () => {
    const res = createMockResponse();
    const genericError = new Error("Database connection dropped with internal secret password=123");

    errorHandler(genericError, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred. Please try again later.",
      },
    });
  });
});
