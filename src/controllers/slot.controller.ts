import { Request, Response, NextFunction } from "express";
import { slotService } from "../services/slot.service";

export class SlotController {
  async publishSlot(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const clinicId = req.params.clinicId as string;
      const slot = await slotService.publishSlot(clinicId, req.body);
      res.status(201).json({
        status: "success",
        data: slot,
      });
    } catch (error) {
      next(error);
    }
  }

  async listClinicSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const clinicId = req.params.clinicId as string;
      const slots = await slotService.listClinicSlots(clinicId, req.query);
      res.status(200).json({
        status: "success",
        data: slots,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSlot(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const slotId = req.params.slotId as string;
      const slot = await slotService.getSlotById(slotId);
      res.status(200).json({
        status: "success",
        data: slot,
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelSlot(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const slotId = req.params.slotId as string;
      const slot = await slotService.cancelSlot(slotId);
      res.status(200).json({
        status: "success",
        message: "Slot successfully cancelled",
        data: slot,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const slotController = new SlotController();
