import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { Repository } from "typeorm";
import { TaxpayerEntity } from "../database/entities/taxpayer.entity";
import { ObligationEntity } from "../database/entities/obligation.entity";
import { TaxTypeEntity } from "../database/entities/tax-type.entity";
import { ObligationStatus } from "../database/enums";
import { SRE_REGION } from "../database/region";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreateObligationDto } from "./dto/create-obligation.dto";

@Injectable()
export class ObligationsService {
  constructor(
    @InjectRepository(ObligationEntity)
    private readonly obligations: Repository<ObligationEntity>,
    @InjectRepository(TaxpayerEntity)
    private readonly taxpayers: Repository<TaxpayerEntity>,
    @InjectRepository(TaxTypeEntity)
    private readonly taxTypes: Repository<TaxTypeEntity>,
  ) {}

  async listForClient(taxpayerId: string) {
    const rows = await this.obligations.find({
      where: { taxpayer: { id: taxpayerId, region: SRE_REGION } },
      relations: { taxpayer: true, taxType: true },
      order: { dueDate: "ASC", createdAt: "DESC" },
    });
    return rows.map((obligation) => this.toObligationView(obligation));
  }

  async listForAdministration() {
    const rows = await this.obligations.find({
      where: { taxpayer: { region: SRE_REGION } },
      relations: { taxpayer: true, taxType: true },
      order: { createdAt: "DESC" },
    });
    return rows.map((obligation) => this.toObligationView(obligation, true));
  }

  async getOne(id: string, user: AuthenticatedUser) {
    const obligation = await this.obligations.findOne({
      where: { id, taxpayer: { region: SRE_REGION } },
      relations: { taxpayer: true, taxType: true },
    });
    if (!obligation) throw new NotFoundException("Obligation introuvable.");
    if (
      user.role !== "ADMIN" &&
      obligation.taxpayer.id !== user.taxpayerId
    ) {
      throw new ForbiddenException("Cette obligation ne vous appartient pas.");
    }
    return this.toObligationView(obligation, user.role === "ADMIN");
  }

  async create(data: CreateObligationDto) {
    const taxReference =
      data.referenceFiscale?.trim() ||
      `OBL-${new Date().getFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    if (await this.obligations.exist({ where: { taxReference } })) {
      throw new ConflictException("Cette référence d'obligation existe déjà.");
    }
    const [taxpayer, taxType] = await Promise.all([
      this.taxpayers.findOneBy({
        id: data.contribuableId,
        region: SRE_REGION,
      }),
      this.taxTypes.findOneBy({ id: data.typeImpotId, isActive: true }),
    ]);
    if (!taxpayer) throw new NotFoundException("Contribuable introuvable.");
    if (!taxType)
      throw new NotFoundException("Type d'impôt actif introuvable.");
    if (
      taxType.applicableTaxpayers !== "TOUS" &&
      taxType.applicableTaxpayers !== taxpayer.type
    ) {
      throw new BadRequestException(
        "Ce type d'impôt n'est pas configuré pour le type de contribuable choisi.",
      );
    }

    const obligation = this.obligations.create({
      taxpayer,
      taxType,
      taxReference,
      period: data.periode.trim(),
      amount: String(data.montant),
      currency: "MGA",
      dueDate: data.echeance.slice(0, 10),
      status: ObligationStatus.TO_PAY,
    });
    return this.toObligationView(await this.obligations.save(obligation), true);
  }

  private toObligationView(obligation: ObligationEntity, includeProfile = false) {
    return {
      id: obligation.id,
      contribuableId: obligation.taxpayer?.id,
      typeImpotId: obligation.taxType?.id,
      typeImpotNom: obligation.taxType?.name,
      referenceFiscale: obligation.taxReference,
      periode: obligation.period,
      montant: Number(obligation.amount),
      devise: obligation.currency,
      echeance: obligation.dueDate,
      statut: obligation.status,
      creeLe: obligation.createdAt,
      ...(includeProfile && obligation.taxpayer
        ? {
            contribuable: {
              id: obligation.taxpayer.id,
              nom: obligation.taxpayer.lastName,
              prenom: obligation.taxpayer.firstName,
              raisonSociale: obligation.taxpayer.legalName,
              nif: obligation.taxpayer.nif,
              courriel: obligation.taxpayer.email,
            },
          }
        : {}),
    };
  }
}
