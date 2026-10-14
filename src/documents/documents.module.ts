import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DocumentPaiementEntity } from "../base-de-donnees/entities/document-paiement.entity";
import { JwtAuthGuard } from "../commun/guards/jwt-auth.guard";
import { RolesGuard } from "../commun/guards/roles.guard";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([DocumentPaiementEntity])],
  controllers: [DocumentsController],
  providers: [DocumentsService, JwtAuthGuard, RolesGuard],
  exports: [DocumentsService],
})
export class DocumentsModule {}
