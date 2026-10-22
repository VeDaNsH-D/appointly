import { Request, Response, NextFunction } from "express";
import { bookingService } from "../services/booking.service";

export class BookingController {
  async bookSlot(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const slotId = (req.params.slotId || req.body.slotId) as string;
      const patientId = req.body.patientId as string;

      const booking = await bookingService.bookSlot(slotId, patientId);
      res.status(201).json({
        status: "success",
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const bookingId = req.params.bookingId as string;
      const booking = await bookingService.cancelBooking(bookingId);
      res.status(200).json({
        status: "success",
        message: "Booking successfully cancelled and slot reopened (if not cancelled)",
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  }

  async getBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const bookingId = req.params.bookingId as string;
      const booking = await bookingService.getBookingById(bookingId);
      res.status(200).json({
        status: "success",
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  }

  async listPatientBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const patientId = req.params.patientId as string;
      const bookings = await bookingService.listPatientBookings(patientId);
      res.status(200).json({
        status: "success",
        data: bookings,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const bookingController = new BookingController();
