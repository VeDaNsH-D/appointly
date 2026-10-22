import { Request, Response, NextFunction } from "express";
import { patientService } from "../services/patient.service";

export class PatientController {
  async createPatient(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const patient = await patientService.createPatient(req.body);
      res.status(201).json({
        status: "success",
        data: patient,
      });
    } catch (error) {
      next(error);
    }
  }

  async getPatient(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const patient = await patientService.getPatientById(req.params.patientId as string);
      res.status(200).json({
        status: "success",
        data: patient,
      });
    } catch (error) {
      next(error);
    }
  }

  async listPatients(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const patients = await patientService.listPatients();
      res.status(200).json({
        status: "success",
        data: patients,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const patientController = new PatientController();
