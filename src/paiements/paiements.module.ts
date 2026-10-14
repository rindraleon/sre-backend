import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EvenementPaiementEntity } from "../base-de-donnees/entities/evenement-paiement.entity";
import { ObligationEntity } from "../base-de-donnees/entities/obligation.entity";
import { PaiementEntity } from "../base-de-donnees/entities/paiement.entity";
import { UtilisateurEntity } from "../base-de-donnees/entities/utilisateur.entity";
import { DocumentsModule } from "../documents/documents.module";
import { JwtAuthGuard } from "../commun/guards/jwt-auth.guard";
import { RolesGuard } from "../commun/guards/roles.guard";
import { PaiementsController } from "./paiements.controller";
import { PaiementsService } from "./paiements.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaiementEntity,
      ObligationEntity,
      EvenementPaiementEntity,
      UtilisateurEntity,
    ]),
    DocumentsModule,
  ],
  controllers: [PaiementsController],
  providers: [PaiementsService, JwtAuthGuard, RolesGuard],
  exports: [PaiementsService],
})
export class PaiementsModule {}
