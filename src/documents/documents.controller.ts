import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { RoleCompte } from "../base-de-donnees/enums";
import { RolesAutorises } from "../commun/decorateurs/roles.decorateur";
import { UtilisateurCourant } from "../commun/decorateurs/utilisateur-courant.decorateur";
import { JwtAuthGuard } from "../commun/guards/jwt-auth.guard";
import { RolesGuard } from "../commun/guards/roles.guard";
import { UtilisateurAuthentifie } from "../commun/interfaces/utilisateur-authentifie.interface";
import { DocumentsService } from "./documents.service";

@Controller("documents")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get("miennes")
  @RolesAutorises(RoleCompte.CLIENT)
  listerMesDocuments(
    @UtilisateurCourant() utilisateur: UtilisateurAuthentifie,
  ) {
    return this.documents.listerMesDocuments(utilisateur.contribuableId ?? "");
  }

  @Get(":id/pdf")
  async telechargerPdf(
    @Param("id", new ParseUUIDPipe()) id: string,
    @UtilisateurCourant() utilisateur: UtilisateurAuthentifie,
  ) {
    const fichier = await this.documents.obtenirPdf(id, utilisateur);
    return new StreamableFile(fichier.contenu, {
      type: "application/pdf",
      disposition: `attachment; filename="${fichier.numero}.pdf"`,
      length: fichier.contenu.length,
    });
  }

  @Get(":id")
  obtenirUnDocument(
    @Param("id", new ParseUUIDPipe()) id: string,
    @UtilisateurCourant() utilisateur: UtilisateurAuthentifie,
  ) {
    return this.documents.obtenirDocument(id, utilisateur);
  }
}
