import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DataSource } from "typeorm";

@Controller()
export class SanteController {
  constructor(private readonly sourceDeDonnees: DataSource) {}

  @Get("sante")
  async obtenirEtat() {
    try {
      await this.sourceDeDonnees.query("SELECT 1");
      return { statut: "ok", baseDeDonnees: "connectee" };
    } catch {
      throw new ServiceUnavailableException({
        statut: "indisponible",
        baseDeDonnees: "indisponible",
      });
    }
  }
}
