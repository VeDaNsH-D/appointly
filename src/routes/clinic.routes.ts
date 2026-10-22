import { Router } from "express";
import { clinicController } from "../controllers/clinic.controller";
import { slotController } from "../controllers/slot.controller";
import { validate } from "../middleware/validate";
import { createClinicSchema, clinicIdParamSchema } from "../schemas/clinic.schema";
import {
  publishSlotBodySchema,
  slotClinicParamsSchema,
  querySlotsSchema,
} from "../schemas/slot.schema";

const router = Router();

router.post(
  "/",
  validate({ body: createClinicSchema }),
  clinicController.createClinic
);

router.get("/", clinicController.listClinics);

router.get(
  "/:clinicId",
  validate({ params: clinicIdParamSchema }),
  clinicController.getClinic
);

// Nested routes for clinic slots
router.post(
  "/:clinicId/slots",
  validate({
    params: slotClinicParamsSchema,
    body: publishSlotBodySchema,
  }),
  slotController.publishSlot
);

router.get(
  "/:clinicId/slots",
  validate({
    params: slotClinicParamsSchema,
    query: querySlotsSchema,
  }),
  slotController.listClinicSlots
);

export { router as clinicRoutes };
