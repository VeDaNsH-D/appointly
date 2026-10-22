import { prisma } from "../lib/prisma";
import { NotFoundError } from "../errors/app-error";
import { CreatePatientInput } from "../schemas/patient.schema";

export class PatientService {
  async createPatient(data: CreatePatientInput) {
    return prisma.patient.create({
      data: {
        name: data.name,
        email: data.email,
      },
    });
  }

  async getPatientById(id: string) {
    const patient = await prisma.patient.findUnique({
      where: { id },
    });

    if (!patient) {
      throw new NotFoundError(`Patient with id ${id} not found`);
    }

    return patient;
  }

  async listPatients() {
    return prisma.patient.findMany({
      orderBy: { createdAt: "desc" },
    });
  }
}

export const patientService = new PatientService();
