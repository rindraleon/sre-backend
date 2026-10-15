import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TaxpayerEntity } from "../database/entities/taxpayer.entity";
import { ObligationEntity } from "../database/entities/obligation.entity";
import { TaxTypeEntity } from "../database/entities/tax-type.entity";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ObligationsController } from "./obligations.controller";
import { ObligationsService } from "./obligations.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ObligationEntity, TaxpayerEntity, TaxTypeEntity]),
  ],
  controllers: [ObligationsController],
  providers: [ObligationsService, JwtAuthGuard, RolesGuard],
  exports: [ObligationsService],
})
export class ObligationsModule {}
