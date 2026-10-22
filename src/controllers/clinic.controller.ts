import { Request, Response, NextFunction } from "express";
import { clinicService } from "../services/clinic.service";

export class ClinicController {
  async createClinic(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const clinic = await clinicService.createClinic(req.body);
      res.status(201).json({
        status: "success",
        data: clinic,
      });
    } catch (error) {
      next(error);
    }
  }

  async getClinic(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const clinic = await clinicService.getClinicById(req.params.clinicId as string);
      res.status(200).json({
        status: "success",
        data: clinic,
      });
    } catch (error) {
      next(error);
    }
  }

  async listClinics(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const clinics = await clinicService.listClinics();
      res.status(200).json({
        status: "success",
        data: clinics,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const clinicController = new ClinicController();
