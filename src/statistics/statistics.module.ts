import { Module } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PaymentsModule } from "../payments/payments.module";
import { StatisticsController } from "./statistics.controller";
import { StatisticsService } from "./statistics.service";

@Module({
  imports: [PaymentsModule],
  controllers: [StatisticsController],
  providers: [StatisticsService, JwtAuthGuard, RolesGuard],
  exports: [StatisticsService],
})
export class StatisticsModule {}
