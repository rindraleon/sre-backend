import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ActivityLogEntity } from "../database/entities/activity-log.entity";
import { JournalController } from "./journal.controller";
import { JournalService } from "./journal.service";

/** Journal d'audit : lecture des événements produits par l'intercepteur global. */
@Module({
  imports: [TypeOrmModule.forFeature([ActivityLogEntity])],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
