import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TypeImpotEntity } from "../base-de-donnees/entities/type-impot.entity";
import { JwtAuthGuard } from "../commun/guards/jwt-auth.guard";
import { RolesGuard } from "../commun/guards/roles.guard";
import { TypesImpotController } from "./types-impot.controller";
import { TypesImpotService } from "./types-impot.service";

@Module({
  imports: [TypeOrmModule.forFeature([TypeImpotEntity])],
  controllers: [TypesImpotController],
  providers: [TypesImpotService, JwtAuthGuard, RolesGuard],
  exports: [TypesImpotService],
})
export class TypesImpotModule {}
