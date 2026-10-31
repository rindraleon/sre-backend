import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { parsePaymentFilters } from "../payments/payment-filters";
import { Granularity, StatisticsService } from "./statistics.service";

function parseGranularity(value?: string): Granularity {
  return value === "jour" || value === "trimestre" || value === "annee"
    ? value
    : "mois";
}

@ApiTags("Statistiques et rapports")
@ApiBearerAuth()
@Controller("statistiques")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.ADMIN)
export class StatisticsController {
  constructor(private readonly statistics: StatisticsService) {}

  @Get()
  @ApiOperation({
    summary: "Indicateurs d'activité calculés sur les paiements enregistrés.",
    description:
      "Les montants confirmés ne comptent que les paiements de statut CONFIRME ; l'en-attente et les échecs sont exposés séparément.",
  })
  @ApiQuery({ name: "granularite", required: false, enum: ["jour", "mois", "trimestre", "annee"] })
  @ApiQuery({ name: "du", required: false })
  @ApiQuery({ name: "au", required: false })
  @ApiResponse({ status: 200, description: "Indicateurs, répartitions et séries temporelles." })
  get(
    @Query("granularite") granularite?: string,
    @Query("du") du?: string,
    @Query("au") au?: string,
    @Query("statut") statut?: string,
    @Query("typeImpotId") typeImpotId?: string,
    @Query("periode") periode?: string,
    @Query("contribuableId") contribuableId?: string,
    @Query("recherche") recherche?: string,
  ) {
    return this.statistics.getStatistics(
      parsePaymentFilters({
        du,
        au,
        statut,
        typeImpotId,
        periode,
        contribuableId,
        recherche,
      }),
      parseGranularity(granularite),
    );
  }

  @Get("export")
  @ApiOperation({ summary: "Exporter les paiements filtrés (CSV ou PDF)." })
  @ApiQuery({ name: "format", required: false, enum: ["csv", "pdf"] })
  @ApiResponse({ status: 200, description: "Fichier CSV (Excel) ou PDF." })
  async export(
    @Res({ passthrough: true }) response: Response,
    @Query("format") format?: string,
    @Query("statut") statut?: string,
    @Query("du") du?: string,
    @Query("au") au?: string,
    @Query("typeImpotId") typeImpotId?: string,
    @Query("periode") periode?: string,
    @Query("contribuableId") contribuableId?: string,
    @Query("montantMin") montantMin?: string,
    @Query("montantMax") montantMax?: string,
    @Query("recherche") recherche?: string,
  ) {
    const filters = parsePaymentFilters({
      statut,
      du,
      au,
      typeImpotId,
      periode,
      contribuableId,
      montantMin,
      montantMax,
      recherche,
    });

    if (format === "pdf") {
      const file = await this.statistics.exportPdf(filters);
      response.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
      });
      return new StreamableFile(file.content);
    }

    const file = await this.statistics.exportCsv(filters);
    response.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
    });
    return file.content;
  }
}
