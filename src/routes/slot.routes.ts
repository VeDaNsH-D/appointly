import { Router } from "express";
import { slotController } from "../controllers/slot.controller";
import { bookingController } from "../controllers/booking.controller";
import { validate } from "../middleware/validate";
import { slotIdParamSchema } from "../schemas/slot.schema";
import { createBookingBodySchema } from "../schemas/booking.schema";

const router = Router();

router.get(
  "/:slotId",
  validate({ params: slotIdParamSchema }),
  slotController.getSlot
);

router.post(
  "/:slotId/cancel",
  validate({ params: slotIdParamSchema }),
  slotController.cancelSlot
);

router.delete(
  "/:slotId",
  validate({ params: slotIdParamSchema }),
  slotController.cancelSlot
);

// Booking slot directly via /slots/:slotId/bookings
router.post(
  "/:slotId/bookings",
  validate({
    params: slotIdParamSchema,
    body: createBookingBodySchema,
  }),
  bookingController.bookSlot
);

export { router as slotRoutes };
