import { Request, Response, NextFunction } from "express";
import { ZodTypeAny, ZodError } from "zod";

interface RequestValidators {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: RequestValidators) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        }));

        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: issues,
          },
        });
        return;
      }
      next(error);
    }
  };
}
