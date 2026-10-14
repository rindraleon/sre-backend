import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ContribuableEntity } from "../base-de-donnees/entities/contribuable.entity";
import { ObligationEntity } from "../base-de-donnees/entities/obligation.entity";
import { TypeImpotEntity } from "../base-de-donnees/entities/type-impot.entity";
import { JwtAuthGuard } from "../commun/guards/jwt-auth.guard";
import { RolesGuard } from "../commun/guards/roles.guard";
import { ObligationsController } from "./obligations.controller";
import { ObligationsService } from "./obligations.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ObligationEntity,
      ContribuableEntity,
      TypeImpotEntity,
    ]),
  ],
  controllers: [ObligationsController],
  providers: [ObligationsService, JwtAuthGuard, RolesGuard],
  exports: [ObligationsService],
})
export class ObligationsModule {}
