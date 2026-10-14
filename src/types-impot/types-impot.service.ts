import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Not, Repository } from "typeorm";
import { TypeImpotEntity } from "../base-de-donnees/entities/type-impot.entity";
import { TypeContribuable } from "../base-de-donnees/enums";
import { CreerTypeImpotDto } from "./dto/creer-type-impot.dto";

@Injectable()
export class TypesImpotService {
  constructor(
    @InjectRepository(TypeImpotEntity)
    private readonly typesImpots: Repository<TypeImpotEntity>,
  ) {}

  listerActifs() {
    return this.typesImpots.find({
      where: { actif: true },
      order: { nom: "ASC" },
    });
  }

  listerTous() {
    return this.typesImpots.find({ order: { creeLe: "DESC" } });
  }

  async creer(donnees: CreerTypeImpotDto) {
    const code = donnees.code.trim().toUpperCase();
    if (await this.typesImpots.exist({ where: { code } })) {
      throw new ConflictException("Ce code de type d'impôt existe déjà.");
    }
    const typeImpot = this.typesImpots.create({
      code,
      nom: donnees.nom.trim(),
      description: donnees.description.trim(),
      categorie: donnees.categorie.trim(),
      contribuablesConcernes: donnees.contribuablesConcernes,
      periodicite: donnees.periodicite,
      regleEcheance: donnees.regleEcheance.trim(),
      modeMontant: donnees.modeMontant,
      montantReference:
        donnees.montantReference === undefined
          ? null
          : String(donnees.montantReference),
      champsComplementaires: donnees.champsComplementaires ?? [],
      actif: donnees.actif ?? true,
    });
    return this.typesImpots.save(typeImpot);
  }

  async modifier(id: string, donnees: CreerTypeImpotDto) {
    const typeImpot = await this.typesImpots.findOneBy({ id });
    if (!typeImpot) throw new NotFoundException("Type d'impôt introuvable.");
    const code = donnees.code.trim().toUpperCase();
    if (await this.typesImpots.exist({ where: { code, id: Not(id) } })) {
      throw new ConflictException("Ce code de type d'impôt existe déjà.");
    }
    Object.assign(typeImpot, {
      code,
      nom: donnees.nom.trim(),
      description: donnees.description.trim(),
      categorie: donnees.categorie.trim(),
      contribuablesConcernes: donnees.contribuablesConcernes,
      periodicite: donnees.periodicite,
      regleEcheance: donnees.regleEcheance.trim(),
      modeMontant: donnees.modeMontant,
      montantReference:
        donnees.montantReference === undefined
          ? null
          : String(donnees.montantReference),
      champsComplementaires: donnees.champsComplementaires ?? [],
      actif: donnees.actif ?? typeImpot.actif,
    });
    return this.typesImpots.save(typeImpot);
  }

  async definirActivite(id: string, actif: boolean) {
    const typeImpot = await this.typesImpots.findOneBy({ id });
    if (!typeImpot) throw new NotFoundException("Type d'impôt introuvable.");
    typeImpot.actif = actif;
    return this.typesImpots.save(typeImpot);
  }

  async correspondAuContribuable(
    idType: string,
    typeContribuable: TypeContribuable,
  ) {
    const typeImpot = await this.typesImpots.findOneBy({
      id: idType,
      actif: true,
    });
    return Boolean(
      typeImpot &&
      (typeImpot.contribuablesConcernes === "TOUS" ||
        typeImpot.contribuablesConcernes === typeContribuable),
    );
  }
}
