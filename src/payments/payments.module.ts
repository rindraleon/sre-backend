import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PaymentEventEntity } from "../database/entities/payment-event.entity";
import { ObligationEntity } from "../database/entities/obligation.entity";
import { PaymentEntity } from "../database/entities/payment.entity";
import { UserEntity } from "../database/entities/user.entity";
import { DocumentsModule } from "../documents/documents.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentEntity,
      ObligationEntity,
      PaymentEventEntity,
      UserEntity,
    ]),
    DocumentsModule,
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, JwtAuthGuard, RolesGuard],
  exports: [PaymentsService],
})
export class PaymentsModule {}
