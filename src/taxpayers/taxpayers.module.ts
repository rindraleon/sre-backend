import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TaxpayerEntity } from "../database/entities/taxpayer.entity";
import { ObligationEntity } from "../database/entities/obligation.entity";
import { PaymentEntity } from "../database/entities/payment.entity";
import { UserEntity } from "../database/entities/user.entity";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { NotificationsModule } from "../notifications/notifications.module";
import { TaxpayersController } from "./taxpayers.controller";
import { TaxpayersService } from "./taxpayers.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TaxpayerEntity,
      ObligationEntity,
      PaymentEntity,
      UserEntity,
    ]),
    NotificationsModule,
  ],
  controllers: [TaxpayersController],
  providers: [TaxpayersService, JwtAuthGuard, RolesGuard, ConfigService],
  exports: [TaxpayersService],
})
export class TaxpayersModule {}
