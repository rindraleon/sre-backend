import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PaymentEventEntity } from "../database/entities/payment-event.entity";
import { ObligationEntity } from "../database/entities/obligation.entity";
import { PaymentEntity } from "../database/entities/payment.entity";
import { TaxTypeEntity } from "../database/entities/tax-type.entity";
import { TaxpayerEntity } from "../database/entities/taxpayer.entity";
import { UserEntity } from "../database/entities/user.entity";
import { DocumentsModule } from "../documents/documents.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PaymentProviderGuard } from "./payment-provider.guard";
import { PaymentProviderController } from "./payment-provider.controller";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentEntity,
      ObligationEntity,
      TaxTypeEntity,
      TaxpayerEntity,
      PaymentEventEntity,
      UserEntity,
    ]),
    DocumentsModule,
    NotificationsModule,
  ],
  controllers: [PaymentsController, PaymentProviderController],
  providers: [PaymentsService, PaymentProviderGuard, JwtAuthGuard, RolesGuard],
  exports: [PaymentsService],
})
export class PaymentsModule {}
