import { prisma } from "../lib/prisma";
import { NotFoundError } from "../errors/app-error";
import { CreateClinicInput } from "../schemas/clinic.schema";

export class ClinicService {
  async createClinic(data: CreateClinicInput) {
    return prisma.clinic.create({
      data: {
        name: data.name,
      },
    });
  }

  async getClinicById(id: string) {
    const clinic = await prisma.clinic.findUnique({
      where: { id },
    });

    if (!clinic) {
      throw new NotFoundError(`Clinic with id ${id} not found`);
    }

    return clinic;
  }

  async listClinics() {
    return prisma.clinic.findMany({
      orderBy: { createdAt: "desc" },
    });
  }
}

export const clinicService = new ClinicService();
