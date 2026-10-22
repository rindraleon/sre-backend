import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { DocumentsService } from "./documents.service";

@ApiTags("Documents fiscaux")
@ApiBearerAuth()
@Controller("documents")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get("miennes")
  @ApiOperation({ summary: "Lister les documents du contribuable authentifié." })
  @ApiResponse({ status: 200, description: "Accusés et reçus internes accessibles au compte." })
  @Roles(AccountRole.CLIENT)
  listMyDocuments(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.listMyDocuments(user.taxpayerId ?? "");
  }

  @Get(":id/pdf")
  @ApiOperation({ summary: "Télécharger le PDF d'un document autorisé." })
  @ApiResponse({ status: 200, description: "Fichier PDF en téléchargement." })
  @ApiResponse({ status: 404, description: "Document absent, annulé ou hors propriété." })
  async downloadPdf(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const file = await this.documents.getPdf(id, user);
    return new StreamableFile(file.content, {
      type: "application/pdf",
      disposition: `attachment; filename="${file.number}.pdf"`,
      length: file.content.length,
    });
  }

  @Get(":id")
  @ApiOperation({ summary: "Consulter les métadonnées d'un document autorisé." })
  @ApiResponse({ status: 200, description: "Métadonnées du document." })
  @ApiResponse({ status: 404, description: "Document introuvable ou hors propriété." })
  getOneDocument(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.getDocument(id, user);
  }
}
