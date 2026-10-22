import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

@ApiTags("Santé du service")
@Controller()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get("sante")
  @ApiOperation({ summary: "Vérifier la disponibilité de l'API et de PostgreSQL." })
  @ApiResponse({ status: 200, description: "API disponible et connexion à la base active." })
  @ApiResponse({ status: 503, description: "Base de données indisponible." })
  async getHealth() {
    try {
      await this.dataSource.query("SELECT 1");
      return { statut: "ok", baseDeDonnees: "connectee" };
    } catch {
      throw new ServiceUnavailableException({
        statut: "indisponible",
        baseDeDonnees: "indisponible",
      });
    }
  }
}
