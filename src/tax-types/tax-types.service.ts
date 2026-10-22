import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Not, Repository } from "typeorm";
import { TaxTypeEntity } from "../database/entities/tax-type.entity";
import { TaxpayerType } from "../database/enums";
import { toTaxTypeView } from "../common/views/entity-views";
import { CreateTaxTypeDto } from "./dto/create-tax-type.dto";

@Injectable()
export class TaxTypesService {
  constructor(
    @InjectRepository(TaxTypeEntity)
    private readonly taxTypes: Repository<TaxTypeEntity>,
  ) {}

  async listActive() {
    const taxTypes = await this.taxTypes.find({
      where: { isActive: true },
      order: { name: "ASC" },
    });
    return taxTypes.map((taxType) => toTaxTypeView(taxType));
  }

  async listAll() {
    const taxTypes = await this.taxTypes.find({
      order: { createdAt: "DESC" },
    });
    return taxTypes.map((taxType) => toTaxTypeView(taxType));
  }

  async create(data: CreateTaxTypeDto) {
    const code = data.code.trim().toUpperCase();
    if (await this.taxTypes.exist({ where: { code } })) {
      throw new ConflictException("Ce code de type d'impôt existe déjà.");
    }
    const taxType = this.taxTypes.create({
      code,
      name: data.nom.trim(),
      description: data.description.trim(),
      category: data.categorie.trim(),
      applicableTaxpayers: data.contribuablesConcernes,
      periodicity: data.periodicite,
      dueDateRule: data.regleEcheance.trim(),
      amountMode: data.modeMontant,
      referenceAmount:
        data.montantReference === undefined
          ? null
          : String(data.montantReference),
      additionalFields: data.champsComplementaires ?? [],
      isActive: data.actif ?? true,
    });
    return toTaxTypeView(await this.taxTypes.save(taxType));
  }

  async update(id: string, data: CreateTaxTypeDto) {
    const taxType = await this.taxTypes.findOneBy({ id });
    if (!taxType) throw new NotFoundException("Type d'impôt introuvable.");
    const code = data.code.trim().toUpperCase();
    if (await this.taxTypes.exist({ where: { code, id: Not(id) } })) {
      throw new ConflictException("Ce code de type d'impôt existe déjà.");
    }
    Object.assign(taxType, {
      code,
      name: data.nom.trim(),
      description: data.description.trim(),
      category: data.categorie.trim(),
      applicableTaxpayers: data.contribuablesConcernes,
      periodicity: data.periodicite,
      dueDateRule: data.regleEcheance.trim(),
      amountMode: data.modeMontant,
      referenceAmount:
        data.montantReference === undefined
          ? null
          : String(data.montantReference),
      additionalFields: data.champsComplementaires ?? [],
      isActive: data.actif ?? taxType.isActive,
    });
    return toTaxTypeView(await this.taxTypes.save(taxType));
  }

  async setActive(id: string, isActive: boolean) {
    const taxType = await this.taxTypes.findOneBy({ id });
    if (!taxType) throw new NotFoundException("Type d'impôt introuvable.");
    taxType.isActive = isActive;
    return toTaxTypeView(await this.taxTypes.save(taxType));
  }

  async matchesTaxpayer(
    idType: string,
    taxpayerType: TaxpayerType,
  ) {
    const taxType = await this.taxTypes.findOneBy({
      id: idType,
      isActive: true,
    });
    return Boolean(
      taxType &&
      (taxType.applicableTaxpayers === "TOUS" ||
        taxType.applicableTaxpayers === taxpayerType),
    );
  }
}
