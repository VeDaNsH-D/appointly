import { Router } from "express";
import { patientController } from "../controllers/patient.controller";
import { bookingController } from "../controllers/booking.controller";
import { validate } from "../middleware/validate";
import { createPatientSchema, patientIdParamSchema } from "../schemas/patient.schema";

const router = Router();

router.post(
  "/",
  validate({ body: createPatientSchema }),
  patientController.createPatient
);

router.get("/", patientController.listPatients);

router.get(
  "/:patientId",
  validate({ params: patientIdParamSchema }),
  patientController.getPatient
);

router.get(
  "/:patientId/bookings",
  validate({ params: patientIdParamSchema }),
  bookingController.listPatientBookings
);

export { router as patientRoutes };
