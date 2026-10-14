import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { DataSource, Repository } from "typeorm";
import { ContribuableEntity } from "../base-de-donnees/entities/contribuable.entity";
import { EvenementPaiementEntity } from "../base-de-donnees/entities/evenement-paiement.entity";
import { ObligationEntity } from "../base-de-donnees/entities/obligation.entity";
import { PaiementEntity } from "../base-de-donnees/entities/paiement.entity";
import { UtilisateurEntity } from "../base-de-donnees/entities/utilisateur.entity";
import { REGION_SRE } from "../base-de-donnees/region-sre";
import {
  ModePaiement,
  RoleCompte,
  StatutObligation,
  StatutPaiement,
} from "../base-de-donnees/enums";
import { UtilisateurAuthentifie } from "../commun/interfaces/utilisateur-authentifie.interface";
import { DocumentsService } from "../documents/documents.service";
import { CreerPaiementDto } from "./dto/creer-paiement.dto";
import { DecisionPaiementDto } from "./dto/decision-paiement.dto";

@Injectable()
export class PaiementsService {
  constructor(
    @InjectRepository(PaiementEntity)
    private readonly paiements: Repository<PaiementEntity>,
    @InjectRepository(ObligationEntity)
    private readonly obligations: Repository<ObligationEntity>,
    private readonly sourceDeDonnees: DataSource,
    private readonly documents: DocumentsService,
  ) {}

  async creerDeclaration(
    utilisateur: UtilisateurAuthentifie,
    donnees: CreerPaiementDto,
  ) {
    if (utilisateur.role !== RoleCompte.CLIENT || !utilisateur.contribuableId) {
      throw new ForbiddenException(
        "Un compte client lié à un contribuable est nécessaire.",
      );
    }

    const idPaiement = await this.sourceDeDonnees.transaction(
      async (gestionnaire) => {
        const depotObligations = gestionnaire.getRepository(ObligationEntity);
        const obligation = await depotObligations
          .createQueryBuilder("obligation")
          .leftJoinAndSelect("obligation.contribuable", "contribuable")
          .leftJoinAndSelect("obligation.typeImpot", "typeImpot")
          .where("obligation.id = :idObligation", {
            idObligation: donnees.obligationId,
          })
          .andWhere("contribuable.id = :idContribuable", {
            idContribuable: utilisateur.contribuableId,
          })
          .setLock("pessimistic_write", undefined, ["obligation"])
          .getOne();

        if (!obligation)
          throw new NotFoundException("Obligation introuvable pour ce compte.");
        const statutsEligibles = [
          StatutObligation.A_PAYER,
          StatutObligation.EN_RETARD,
          StatutObligation.REJETE,
          StatutObligation.CORRECTION_DEMANDEE,
        ];
        if (!statutsEligibles.includes(obligation.statut)) {
          throw new ConflictException(
            "Cette obligation possède déjà une déclaration en cours ou est réglée.",
          );
        }
        if (
          donnees.mode === ModePaiement.MOBILE_MONEY &&
          (!donnees.operateur || !donnees.telephoneUtilise)
        ) {
          throw new BadRequestException(
            "L'opérateur et le numéro sont requis pour une déclaration mobile-money.",
          );
        }
        if (
          donnees.mode === ModePaiement.VIREMENT_BANCAIRE &&
          !donnees.banqueOuCanal?.trim()
        ) {
          throw new BadRequestException(
            "Le canal déclaré est requis pour une déclaration de virement.",
          );
        }

        const referenceUnique = randomUUID()
          .replaceAll("-", "")
          .slice(0, 12)
          .toUpperCase();
        const referenceInterne = `PAY-${new Date().getFullYear()}-${referenceUnique}`;
        const depotPaiements = gestionnaire.getRepository(PaiementEntity);
        const paiement = depotPaiements.create({
          referenceInterne,
          contribuable: obligation.contribuable,
          obligation,
          montant: obligation.montant,
          devise: "MGA",
          mode: donnees.mode,
          operateur:
            donnees.mode === ModePaiement.MOBILE_MONEY
              ? (donnees.operateur ?? null)
              : null,
          telephoneUtilise:
            donnees.mode === ModePaiement.MOBILE_MONEY
              ? (donnees.telephoneUtilise?.trim() ?? null)
              : null,
          banqueOuCanal:
            donnees.mode === ModePaiement.VIREMENT_BANCAIRE
              ? (donnees.banqueOuCanal?.trim() ?? null)
              : null,
          titulairePayeur: donnees.titulairePayeur?.trim() || null,
          referenceTransaction: donnees.referenceTransaction.trim(),
          dateTransaction: donnees.dateTransaction.slice(0, 10),
          justificatifNom: this.nettoyerNomJustificatif(
            donnees.justificatifNom,
          ),
          statut: StatutPaiement.EN_VERIFICATION,
          valideLe: null,
          validePar: null,
          motifDecision: null,
        });
        const paiementEnregistre = await depotPaiements.save(paiement);

        obligation.statut = StatutObligation.EN_VERIFICATION;
        await depotObligations.save(obligation);

        const depotEvenements = gestionnaire.getRepository(
          EvenementPaiementEntity,
        );
        const evenement = depotEvenements.create({
          paiement: paiementEnregistre,
          statut: StatutPaiement.EN_VERIFICATION,
          libelle: "Déclaration soumise — paiement non vérifié",
          acteur: gestionnaire
            .getRepository(UtilisateurEntity)
            .create({ id: utilisateur.id }),
          nomActeur: utilisateur.nom,
          motif: null,
        });
        await depotEvenements.save(evenement);
        await this.documents.creerAccuse(gestionnaire, {
          ...paiementEnregistre,
          contribuable: obligation.contribuable,
          obligation,
        });
        return paiementEnregistre.id;
      },
    );

    return this.obtenirUne(idPaiement, utilisateur);
  }

  async listerMesPaiements(utilisateur: UtilisateurAuthentifie) {
    if (!utilisateur.contribuableId) return [];
    const lignes = await this.chargerRequete()
      .where("contribuable.id = :idContribuable", {
        idContribuable: utilisateur.contribuableId,
      })
      .andWhere("contribuable.region = :region", { region: REGION_SRE })
      .orderBy("paiement.soumisLe", "DESC")
      .getMany();
    return lignes.map((paiement) => this.vuePaiement(paiement));
  }

  async listerPourAdministration(
    statut?: StatutPaiement,
    page = 1,
    parPage = 25,
  ) {
    const numeroPage = Math.max(1, Math.floor(page) || 1);
    const taillePage = Math.min(100, Math.max(1, Math.floor(parPage) || 25));
    const requete = this.chargerRequete()
      .where("contribuable.region = :region", { region: REGION_SRE })
      .orderBy("paiement.soumisLe", "DESC");
    if (statut) requete.andWhere("paiement.statut = :statut", { statut });
    const [lignes, total] = await requete
      .skip((numeroPage - 1) * taillePage)
      .take(taillePage)
      .getManyAndCount();
    return {
      donnees: lignes.map((paiement) => this.vuePaiement(paiement)),
      total,
      page: numeroPage,
      parPage: taillePage,
    };
  }

  async obtenirUne(id: string, utilisateur: UtilisateurAuthentifie) {
    const requete = this.chargerRequete()
      .where("paiement.id = :idPaiement", { idPaiement: id })
      .andWhere("contribuable.region = :region", { region: REGION_SRE });
    if (utilisateur.role !== RoleCompte.ADMIN) {
      if (!utilisateur.contribuableId)
        throw new NotFoundException("Déclaration introuvable.");
      requete.andWhere("contribuable.id = :idContribuable", {
        idContribuable: utilisateur.contribuableId,
      });
    }
    const paiement = await requete.getOne();
    if (!paiement) throw new NotFoundException("Déclaration introuvable.");
    return this.vuePaiement(paiement);
  }

  async decider(
    id: string,
    utilisateur: UtilisateurAuthentifie,
    donnees: DecisionPaiementDto,
  ) {
    if (utilisateur.role !== RoleCompte.ADMIN)
      throw new ForbiddenException("Décision réservée à l'administration.");
    const statut = donnees.statut;
    if (
      ![
        StatutPaiement.CONFIRME,
        StatutPaiement.REJETE,
        StatutPaiement.CORRECTION_DEMANDEE,
      ].includes(statut)
    ) {
      throw new BadRequestException("Statut de décision invalide.");
    }
    if (
      statut !== StatutPaiement.CONFIRME &&
      (!donnees.motif || donnees.motif.trim().length < 5)
    ) {
      throw new BadRequestException(
        "Un motif d'au moins 5 caractères est requis pour cette décision.",
      );
    }

    await this.sourceDeDonnees.transaction(async (gestionnaire) => {
      const depotPaiements = gestionnaire.getRepository(PaiementEntity);
      const verrou = await depotPaiements
        .createQueryBuilder("paiement")
        .where("paiement.id = :idPaiement", { idPaiement: id })
        .setLock("pessimistic_write")
        .getOne();
      if (!verrou) throw new NotFoundException("Déclaration introuvable.");
      if (verrou.statut !== StatutPaiement.EN_VERIFICATION) {
        throw new ConflictException(
          "Une décision a déjà été enregistrée pour cette déclaration.",
        );
      }

      const paiement = await depotPaiements.findOne({
        where: { id, contribuable: { region: REGION_SRE } },
        relations: { contribuable: true, obligation: { typeImpot: true } },
      });
      if (!paiement)
        throw new NotFoundException(
          "Déclaration introuvable dans le périmètre du service.",
        );
      const depotObligations = gestionnaire.getRepository(ObligationEntity);
      const obligation = await depotObligations
        .createQueryBuilder("obligation")
        .where("obligation.id = :idObligation", {
          idObligation: paiement.obligation.id,
        })
        .setLock("pessimistic_write")
        .getOne();
      if (!obligation)
        throw new NotFoundException("Obligation liée introuvable.");

      const administrateur = gestionnaire
        .getRepository(UtilisateurEntity)
        .create({ id: utilisateur.id });
      const dateDecision = new Date();
      const motif = donnees.motif?.trim() || null;
      paiement.statut = statut;
      paiement.valideLe =
        statut === StatutPaiement.CONFIRME ? dateDecision : null;
      paiement.validePar = administrateur;
      paiement.motifDecision = motif;
      await depotPaiements.save(paiement);

      obligation.statut =
        statut === StatutPaiement.CONFIRME
          ? StatutObligation.PAYE
          : statut === StatutPaiement.REJETE
            ? StatutObligation.REJETE
            : StatutObligation.CORRECTION_DEMANDEE;
      await depotObligations.save(obligation);

      const libelle =
        statut === StatutPaiement.CONFIRME
          ? "Déclaration confirmée par une décision administrative — hors vérification bancaire"
          : statut === StatutPaiement.REJETE
            ? "Déclaration rejetée"
            : "Correction demandée";
      const evenement = gestionnaire
        .getRepository(EvenementPaiementEntity)
        .create({
          paiement,
          statut,
          libelle,
          acteur: administrateur,
          nomActeur: utilisateur.nom,
          motif,
          creeLe: dateDecision,
        });
      await gestionnaire.getRepository(EvenementPaiementEntity).save(evenement);

      if (statut === StatutPaiement.CONFIRME) {
        await this.documents.creerRecuInterne(
          gestionnaire,
          paiement,
          administrateur,
        );
      }
    });

    return this.obtenirUne(id, utilisateur);
  }

  private chargerRequete() {
    return this.paiements
      .createQueryBuilder("paiement")
      .leftJoinAndSelect("paiement.contribuable", "contribuable")
      .leftJoinAndSelect("paiement.obligation", "obligation")
      .leftJoinAndSelect("obligation.typeImpot", "typeImpot")
      .leftJoinAndSelect("paiement.historique", "historique")
      .leftJoinAndSelect("paiement.documents", "documents");
  }

  private vuePaiement(paiement: PaiementEntity) {
    return {
      id: paiement.id,
      referenceInterne: paiement.referenceInterne,
      contribuableId: paiement.contribuable?.id,
      contribuable: paiement.contribuable
        ? {
            id: paiement.contribuable.id,
            nom: paiement.contribuable.nom,
            prenom: paiement.contribuable.prenom,
            raisonSociale: paiement.contribuable.raisonSociale,
            nif: paiement.contribuable.nif,
            courriel: paiement.contribuable.courriel,
          }
        : undefined,
      obligationId: paiement.obligation?.id,
      typeImpotId: paiement.obligation?.typeImpot?.id,
      typeImpotNom: paiement.obligation?.typeImpot?.nom,
      referenceFiscale: paiement.obligation?.referenceFiscale,
      periode: paiement.obligation?.periode,
      montant: Number(paiement.montant),
      devise: paiement.devise,
      mode: paiement.mode,
      operateur: paiement.operateur,
      telephoneUtilise: paiement.telephoneUtilise,
      banqueOuCanal: paiement.banqueOuCanal,
      titulairePayeur: paiement.titulairePayeur,
      referenceTransaction: paiement.referenceTransaction,
      dateTransaction: paiement.dateTransaction,
      justificatifNom: paiement.justificatifNom,
      statut: paiement.statut,
      soumisLe: paiement.soumisLe,
      valideLe: paiement.valideLe,
      validePar: paiement.validePar?.nom,
      motifRejet: paiement.motifDecision,
      historique: [...(paiement.historique ?? [])]
        .sort((a, b) => a.creeLe.getTime() - b.creeLe.getTime())
        .map((evenement) => ({
          statut: evenement.statut,
          libelle: evenement.libelle,
          date: evenement.creeLe,
          acteur: evenement.nomActeur,
          motif: evenement.motif,
        })),
      documents: [...(paiement.documents ?? [])]
        .filter((document) => document.statut === "VALIDE")
        .sort((a, b) => a.emisLe.getTime() - b.emisLe.getTime())
        .map((document) => ({
          id: document.id,
          numero: document.numero,
          type: document.type,
          emisLe: document.emisLe,
          montant: Number(document.montant),
          devise: document.devise,
          statut: document.statut,
          contribuableId: document.contribuable?.id,
          referencePaiement: paiement.referenceInterne,
          typeImpotNom: paiement.obligation?.typeImpot?.nom,
          periode: paiement.obligation?.periode,
          referenceTransactionDeclaree: paiement.referenceTransaction,
          modeDeclare: paiement.mode,
          emetteur: document.emetteur,
          mention: document.mention,
          emisPar: document.emisPar?.nom,
          lienPdf: `/documents/${document.id}/pdf`,
        })),
    };
  }

  private nettoyerNomJustificatif(nom?: string) {
    if (!nom) return null;
    const nettoye = nom
      .replace(/[\\/]/g, "_")
      .replace(/[\u0000-\u001f]/g, "")
      .trim();
    return nettoye.slice(0, 200) || null;
  }
}
