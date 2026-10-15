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
import { TaxpayerEntity } from "../database/entities/taxpayer.entity";
import { PaymentEventEntity } from "../database/entities/payment-event.entity";
import { ObligationEntity } from "../database/entities/obligation.entity";
import { PaymentEntity } from "../database/entities/payment.entity";
import { UserEntity } from "../database/entities/user.entity";
import { SRE_REGION } from "../database/region";
import {
  PaymentMethod,
  AccountRole,
  ObligationStatus,
  PaymentStatus,
} from "../database/enums";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { DocumentsService } from "../documents/documents.service";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { PaymentDecisionDto } from "./dto/payment-decision.dto";

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paiements: Repository<PaymentEntity>,
    @InjectRepository(ObligationEntity)
    private readonly obligations: Repository<ObligationEntity>,
    private readonly sourceDeDonnees: DataSource,
    private readonly documents: DocumentsService,
  ) {}

  async creerDeclaration(
    utilisateur: AuthenticatedUser,
    donnees: CreatePaymentDto,
  ) {
    if (
      utilisateur.role !== AccountRole.CLIENT ||
      !utilisateur.contribuableId
    ) {
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
          ObligationStatus.A_PAYER,
          ObligationStatus.EN_RETARD,
          ObligationStatus.REJETE,
          ObligationStatus.CORRECTION_DEMANDEE,
        ];
        if (!statutsEligibles.includes(obligation.statut)) {
          throw new ConflictException(
            "Cette obligation possède déjà une déclaration en cours ou est réglée.",
          );
        }
        if (
          donnees.mode === PaymentMethod.MOBILE_MONEY &&
          (!donnees.operateur || !donnees.telephoneUtilise)
        ) {
          throw new BadRequestException(
            "L'opérateur et le numéro sont requis pour une déclaration mobile-money.",
          );
        }
        if (
          donnees.mode === PaymentMethod.VIREMENT_BANCAIRE &&
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
        const depotPaiements = gestionnaire.getRepository(PaymentEntity);
        const paiement = depotPaiements.create({
          referenceInterne,
          contribuable: obligation.contribuable,
          obligation,
          montant: obligation.montant,
          devise: "MGA",
          mode: donnees.mode,
          operateur:
            donnees.mode === PaymentMethod.MOBILE_MONEY
              ? (donnees.operateur ?? null)
              : null,
          telephoneUtilise:
            donnees.mode === PaymentMethod.MOBILE_MONEY
              ? (donnees.telephoneUtilise?.trim() ?? null)
              : null,
          banqueOuCanal:
            donnees.mode === PaymentMethod.VIREMENT_BANCAIRE
              ? (donnees.banqueOuCanal?.trim() ?? null)
              : null,
          titulairePayeur: donnees.titulairePayeur?.trim() || null,
          referenceTransaction: donnees.referenceTransaction.trim(),
          dateTransaction: donnees.dateTransaction.slice(0, 10),
          justificatifNom: this.nettoyerNomJustificatif(
            donnees.justificatifNom,
          ),
          statut: PaymentStatus.EN_VERIFICATION,
          valideLe: null,
          validePar: null,
          motifDecision: null,
        });
        const paiementEnregistre = await depotPaiements.save(paiement);

        obligation.statut = ObligationStatus.EN_VERIFICATION;
        await depotObligations.save(obligation);

        const depotEvenements = gestionnaire.getRepository(PaymentEventEntity);
        const evenement = depotEvenements.create({
          paiement: paiementEnregistre,
          statut: PaymentStatus.EN_VERIFICATION,
          libelle: "Déclaration soumise — paiement non vérifié",
          acteur: gestionnaire
            .getRepository(UserEntity)
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

  async listerMesPaiements(utilisateur: AuthenticatedUser) {
    if (!utilisateur.contribuableId) return [];
    const lignes = await this.chargerRequete()
      .where("contribuable.id = :idContribuable", {
        idContribuable: utilisateur.contribuableId,
      })
      .andWhere("contribuable.region = :region", { region: SRE_REGION })
      .orderBy("paiement.soumisLe", "DESC")
      .getMany();
    return lignes.map((paiement) => this.vuePaiement(paiement));
  }

  async listerPourAdministration(
    statut?: PaymentStatus,
    page = 1,
    parPage = 25,
  ) {
    const numeroPage = Math.max(1, Math.floor(page) || 1);
    const taillePage = Math.min(100, Math.max(1, Math.floor(parPage) || 25));
    const requete = this.chargerRequete()
      .where("contribuable.region = :region", { region: SRE_REGION })
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

  async obtenirUne(id: string, utilisateur: AuthenticatedUser) {
    const requete = this.chargerRequete()
      .where("paiement.id = :idPaiement", { idPaiement: id })
      .andWhere("contribuable.region = :region", { region: SRE_REGION });
    if (utilisateur.role !== AccountRole.ADMIN) {
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
    utilisateur: AuthenticatedUser,
    donnees: PaymentDecisionDto,
  ) {
    if (utilisateur.role !== AccountRole.ADMIN)
      throw new ForbiddenException("Décision réservée à l'administration.");
    const statut = donnees.statut;
    if (
      ![
        PaymentStatus.CONFIRME,
        PaymentStatus.REJETE,
        PaymentStatus.CORRECTION_DEMANDEE,
      ].includes(statut)
    ) {
      throw new BadRequestException("Statut de décision invalide.");
    }
    if (
      statut !== PaymentStatus.CONFIRME &&
      (!donnees.motif || donnees.motif.trim().length < 5)
    ) {
      throw new BadRequestException(
        "Un motif d'au moins 5 caractères est requis pour cette décision.",
      );
    }

    await this.sourceDeDonnees.transaction(async (gestionnaire) => {
      const depotPaiements = gestionnaire.getRepository(PaymentEntity);
      const verrou = await depotPaiements
        .createQueryBuilder("paiement")
        .where("paiement.id = :idPaiement", { idPaiement: id })
        .setLock("pessimistic_write")
        .getOne();
      if (!verrou) throw new NotFoundException("Déclaration introuvable.");
      if (verrou.statut !== PaymentStatus.EN_VERIFICATION) {
        throw new ConflictException(
          "Une décision a déjà été enregistrée pour cette déclaration.",
        );
      }

      const paiement = await depotPaiements.findOne({
        where: { id, contribuable: { region: SRE_REGION } },
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
        .getRepository(UserEntity)
        .create({ id: utilisateur.id });
      const dateDecision = new Date();
      const motif = donnees.motif?.trim() || null;
      paiement.statut = statut;
      paiement.valideLe =
        statut === PaymentStatus.CONFIRME ? dateDecision : null;
      paiement.validePar = administrateur;
      paiement.motifDecision = motif;
      await depotPaiements.save(paiement);

      obligation.statut =
        statut === PaymentStatus.CONFIRME
          ? ObligationStatus.PAYE
          : statut === PaymentStatus.REJETE
            ? ObligationStatus.REJETE
            : ObligationStatus.CORRECTION_DEMANDEE;
      await depotObligations.save(obligation);

      const libelle =
        statut === PaymentStatus.CONFIRME
          ? "Déclaration confirmée par une décision administrative — hors vérification bancaire"
          : statut === PaymentStatus.REJETE
            ? "Déclaration rejetée"
            : "Correction demandée";
      const evenement = gestionnaire.getRepository(PaymentEventEntity).create({
        paiement,
        statut,
        libelle,
        acteur: administrateur,
        nomActeur: utilisateur.nom,
        motif,
        creeLe: dateDecision,
      });
      await gestionnaire.getRepository(PaymentEventEntity).save(evenement);

      if (statut === PaymentStatus.CONFIRME) {
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

  private vuePaiement(paiement: PaymentEntity) {
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
