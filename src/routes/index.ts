import { Router } from "express";
import { clinicRoutes } from "./clinic.routes";
import { patientRoutes } from "./patient.routes";
import { slotRoutes } from "./slot.routes";
import { bookingRoutes } from "./booking.routes";

const router = Router();

router.get("/health", (_req, res) => {
  res.status(200).json({
    status: "success",
    message: "Appointly API is running smoothly",
    timestamp: new Date().toISOString(),
  });
});

router.use("/clinics", clinicRoutes);
router.use("/patients", patientRoutes);
router.use("/slots", slotRoutes);
router.use("/bookings", bookingRoutes);

export { router as apiRouter };
