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
import { ContribuableEntity } from "../base-de-donnees/entities/contribuable.entity";
import { ObligationEntity } from "../base-de-donnees/entities/obligation.entity";
import { TypeImpotEntity } from "../base-de-donnees/entities/type-impot.entity";
import { StatutObligation } from "../base-de-donnees/enums";
import { REGION_SRE } from "../base-de-donnees/region-sre";
import { UtilisateurAuthentifie } from "../commun/interfaces/utilisateur-authentifie.interface";
import { CreerObligationDto } from "./dto/creer-obligation.dto";

@Injectable()
export class ObligationsService {
  constructor(
    @InjectRepository(ObligationEntity)
    private readonly obligations: Repository<ObligationEntity>,
    @InjectRepository(ContribuableEntity)
    private readonly contribuables: Repository<ContribuableEntity>,
    @InjectRepository(TypeImpotEntity)
    private readonly typesImpots: Repository<TypeImpotEntity>,
  ) {}

  async listerPourClient(idContribuable: string) {
    const lignes = await this.obligations.find({
      where: { contribuable: { id: idContribuable, region: REGION_SRE } },
      relations: { contribuable: true, typeImpot: true },
      order: { echeance: "ASC", creeLe: "DESC" },
    });
    return lignes.map((obligation) => this.vueObligation(obligation));
  }

  async listerPourAdministration() {
    const lignes = await this.obligations.find({
      where: { contribuable: { region: REGION_SRE } },
      relations: { contribuable: true, typeImpot: true },
      order: { creeLe: "DESC" },
    });
    return lignes.map((obligation) => this.vueObligation(obligation, true));
  }

  async obtenirUne(id: string, utilisateur: UtilisateurAuthentifie) {
    const obligation = await this.obligations.findOne({
      where: { id, contribuable: { region: REGION_SRE } },
      relations: { contribuable: true, typeImpot: true },
    });
    if (!obligation) throw new NotFoundException("Obligation introuvable.");
    if (
      utilisateur.role !== "ADMIN" &&
      obligation.contribuable.id !== utilisateur.contribuableId
    ) {
      throw new ForbiddenException("Cette obligation ne vous appartient pas.");
    }
    return this.vueObligation(obligation, utilisateur.role === "ADMIN");
  }

  async creer(donnees: CreerObligationDto) {
    const referenceFiscale =
      donnees.referenceFiscale?.trim() ||
      `OBL-${new Date().getFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    if (await this.obligations.exist({ where: { referenceFiscale } })) {
      throw new ConflictException("Cette référence d'obligation existe déjà.");
    }
    const [contribuable, typeImpot] = await Promise.all([
      this.contribuables.findOneBy({
        id: donnees.contribuableId,
        region: REGION_SRE,
      }),
      this.typesImpots.findOneBy({ id: donnees.typeImpotId, actif: true }),
    ]);
    if (!contribuable) throw new NotFoundException("Contribuable introuvable.");
    if (!typeImpot)
      throw new NotFoundException("Type d'impôt actif introuvable.");
    if (
      typeImpot.contribuablesConcernes !== "TOUS" &&
      typeImpot.contribuablesConcernes !== contribuable.type
    ) {
      throw new BadRequestException(
        "Ce type d'impôt n'est pas configuré pour le type de contribuable choisi.",
      );
    }

    const obligation = this.obligations.create({
      contribuable,
      typeImpot,
      referenceFiscale,
      periode: donnees.periode.trim(),
      montant: String(donnees.montant),
      devise: "MGA",
      echeance: donnees.echeance.slice(0, 10),
      statut: StatutObligation.A_PAYER,
    });
    return this.vueObligation(await this.obligations.save(obligation), true);
  }

  private vueObligation(obligation: ObligationEntity, inclureProfil = false) {
    return {
      id: obligation.id,
      contribuableId: obligation.contribuable?.id,
      typeImpotId: obligation.typeImpot?.id,
      typeImpotNom: obligation.typeImpot?.nom,
      referenceFiscale: obligation.referenceFiscale,
      periode: obligation.periode,
      montant: Number(obligation.montant),
      devise: obligation.devise,
      echeance: obligation.echeance,
      statut: obligation.statut,
      creeLe: obligation.creeLe,
      ...(inclureProfil && obligation.contribuable
        ? {
            contribuable: {
              id: obligation.contribuable.id,
              nom: obligation.contribuable.nom,
              prenom: obligation.contribuable.prenom,
              raisonSociale: obligation.contribuable.raisonSociale,
              nif: obligation.contribuable.nif,
              courriel: obligation.contribuable.courriel,
            },
          }
        : {}),
    };
  }
}
