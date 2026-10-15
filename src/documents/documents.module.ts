import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PaymentDocumentEntity } from "../database/entities/payment-document.entity";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([PaymentDocumentEntity])],
  controllers: [DocumentsController],
  providers: [DocumentsService, JwtAuthGuard, RolesGuard],
  exports: [DocumentsService],
})
export class DocumentsModule {}
