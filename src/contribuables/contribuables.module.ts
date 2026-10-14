import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ContribuableEntity } from "../base-de-donnees/entities/contribuable.entity";
import { ObligationEntity } from "../base-de-donnees/entities/obligation.entity";
import { PaiementEntity } from "../base-de-donnees/entities/paiement.entity";
import { UtilisateurEntity } from "../base-de-donnees/entities/utilisateur.entity";
import { JwtAuthGuard } from "../commun/guards/jwt-auth.guard";
import { RolesGuard } from "../commun/guards/roles.guard";
import { ContribuablesController } from "./contribuables.controller";
import { ContribuablesService } from "./contribuables.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContribuableEntity,
      ObligationEntity,
      PaiementEntity,
      UtilisateurEntity,
    ]),
  ],
  controllers: [ContribuablesController],
  providers: [ContribuablesService, JwtAuthGuard, RolesGuard],
  exports: [ContribuablesService],
})
export class ContribuablesModule {}
