import { Router } from "express";
import { bookingController } from "../controllers/booking.controller";
import { validate } from "../middleware/validate";
import {
  createBookingBodySchema,
  bookingIdParamSchema,
} from "../schemas/booking.schema";

const router = Router();

router.post(
  "/",
  validate({ body: createBookingBodySchema }),
  bookingController.bookSlot
);

router.get(
  "/:bookingId",
  validate({ params: bookingIdParamSchema }),
  bookingController.getBooking
);

router.post(
  "/:bookingId/cancel",
  validate({ params: bookingIdParamSchema }),
  bookingController.cancelBooking
);

router.delete(
  "/:bookingId",
  validate({ params: bookingIdParamSchema }),
  bookingController.cancelBooking
);

export { router as bookingRoutes };
