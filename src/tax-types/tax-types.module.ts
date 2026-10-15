import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TaxTypeEntity } from "../database/entities/tax-type.entity";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TaxTypesController } from "./tax-types.controller";
import { TaxTypesService } from "./tax-types.service";

@Module({
  imports: [TypeOrmModule.forFeature([TaxTypeEntity])],
  controllers: [TaxTypesController],
  providers: [TaxTypesService, JwtAuthGuard, RolesGuard],
  exports: [TaxTypesService],
})
export class TaxTypesModule {}
