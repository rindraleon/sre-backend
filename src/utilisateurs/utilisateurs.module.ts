import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UtilisateurEntity } from "../base-de-donnees/entities/utilisateur.entity";
import { JwtAuthGuard } from "../commun/guards/jwt-auth.guard";
import { RolesGuard } from "../commun/guards/roles.guard";
import { UtilisateursController } from "./utilisateurs.controller";
import { UtilisateursService } from "./utilisateurs.service";

@Module({
  imports: [TypeOrmModule.forFeature([UtilisateurEntity])],
  controllers: [UtilisateursController],
  providers: [UtilisateursService, JwtAuthGuard, RolesGuard],
})
export class UtilisateursModule {}
