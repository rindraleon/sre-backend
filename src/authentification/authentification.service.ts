import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { DataSource, Repository } from "typeorm";
import { ContribuableEntity } from "../base-de-donnees/entities/contribuable.entity";
import { UtilisateurEntity } from "../base-de-donnees/entities/utilisateur.entity";
import { RoleCompte, StatutCompte } from "../base-de-donnees/enums";
import { UtilisateurAuthentifie } from "../commun/interfaces/utilisateur-authentifie.interface";
import { ChangerMotDePasseDto } from "./dto/changer-mot-de-passe.dto";
import { ConnexionDto } from "./dto/connexion.dto";
import { InscriptionDto } from "./dto/profil-inscription.dto";

@Injectable()
export class AuthentificationService {
  constructor(
    @InjectRepository(UtilisateurEntity)
    private readonly utilisateurs: Repository<UtilisateurEntity>,
    private readonly sourceDeDonnees: DataSource,
    private readonly jetons: JwtService,
    private readonly configuration: ConfigService,
  ) {}

  async obtenirEtatInscription() {
    return {
      administrateurInitialise: await this.utilisateurs.exist({
        where: { role: RoleCompte.ADMIN },
      }),
    };
  }

  async inscrire(donnees: InscriptionDto) {
    const courriel = donnees.courriel.trim().toLowerCase();
    const resultat = await this.sourceDeDonnees.transaction(
      async (gestionnaire) => {
        // Le verrou transactionnel empêche deux inscriptions simultanées d'obtenir le rôle administrateur initial.
        await gestionnaire.query(
          "SELECT pg_advisory_xact_lock($1)",
          [2026101201],
        );
        const depotUtilisateurs = gestionnaire.getRepository(UtilisateurEntity);
        const nombreUtilisateurs = await depotUtilisateurs.count();
        const role =
          nombreUtilisateurs === 0 ? RoleCompte.ADMIN : RoleCompte.CLIENT;

        if (await depotUtilisateurs.exist({ where: { courriel } })) {
          throw new ConflictException(
            "Cette adresse courriel est déjà utilisée.",
          );
        }
        if (role === RoleCompte.CLIENT && !donnees.profil) {
          throw new BadRequestException(
            "Un profil contribuable est requis pour créer un compte client.",
          );
        }
        if (
          donnees.profil &&
          donnees.profil.courriel.trim().toLowerCase() !== courriel
        ) {
          throw new BadRequestException(
            "L'adresse courriel du profil doit correspondre à celle du compte.",
          );
        }
        if (role === RoleCompte.CLIENT && donnees.profil) {
          const depotContribuables =
            gestionnaire.getRepository(ContribuableEntity);
          const nif = donnees.profil.nif?.trim().toUpperCase();
          const stat = donnees.profil.stat?.trim().toUpperCase();
          if (nif && (await depotContribuables.exist({ where: { nif } }))) {
            throw new ConflictException("Ce NIF est déjà associé à un profil.");
          }
          if (stat && (await depotContribuables.exist({ where: { stat } }))) {
            throw new ConflictException(
              "Ce STAT est déjà associé à un profil.",
            );
          }
        }

        const nombreTours = Number(
          this.configuration.get<string>("BCRYPT_ROUNDS", "12"),
        );
        const nouvelUtilisateur = depotUtilisateurs.create({
          nom: donnees.nom.trim(),
          courriel,
          motDePasseHash: await bcrypt.hash(donnees.motDePasse, nombreTours),
          role,
          statut: StatutCompte.ACTIF,
          changementMotDePasseRequis: false,
          derniereConnexion: new Date(),
        });
        await depotUtilisateurs.save(nouvelUtilisateur);

        let contribuable: ContribuableEntity | null = null;
        if (role === RoleCompte.CLIENT && donnees.profil) {
          const depotContribuables =
            gestionnaire.getRepository(ContribuableEntity);
          const profil = donnees.profil;
          contribuable = depotContribuables.create({
            utilisateur: nouvelUtilisateur,
            type: profil.type,
            nom: profil.nom.trim(),
            prenom: profil.prenom?.trim() || null,
            raisonSociale: profil.raisonSociale?.trim() || null,
            nomCommercial: profil.nomCommercial?.trim() || null,
            nif: profil.nif?.trim().toUpperCase() || null,
            stat: profil.stat?.trim().toUpperCase() || null,
            adresse: profil.adresse.trim(),
            region: profil.region.trim(),
            ville: profil.ville.trim(),
            courriel,
            telephone: profil.telephone.trim(),
            representantLegal: profil.representantLegal?.trim() || null,
            nomContact: profil.nomContact?.trim() || null,
            prenomContact: profil.prenomContact?.trim() || null,
            fonctionContact: profil.fonctionContact?.trim() || null,
            dateCreationCompte: new Date(),
          });
          await depotContribuables.save(contribuable);
        }
        return { utilisateur: nouvelUtilisateur, contribuable };
      },
    );

    return this.reponseAvecJeton(
      resultat.utilisateur,
      resultat.contribuable?.id,
    );
  }

  async connecter(donnees: ConnexionDto) {
    const courriel = donnees.courriel.trim().toLowerCase();
    const utilisateur = await this.utilisateurs
      .createQueryBuilder("utilisateur")
      .addSelect("utilisateur.motDePasseHash")
      .leftJoinAndSelect("utilisateur.contribuable", "contribuable")
      .where("LOWER(utilisateur.courriel) = :courriel", { courriel })
      .getOne();

    if (
      !utilisateur ||
      utilisateur.statut !== StatutCompte.ACTIF ||
      !(await bcrypt.compare(donnees.motDePasse, utilisateur.motDePasseHash))
    ) {
      throw new UnauthorizedException(
        "Adresse courriel ou mot de passe incorrect.",
      );
    }

    utilisateur.derniereConnexion = new Date();
    await this.utilisateurs.save(utilisateur);
    return this.reponseAvecJeton(utilisateur, utilisateur.contribuable?.id);
  }

  async obtenirMonCompte(idUtilisateur: string) {
    const utilisateur = await this.utilisateurs.findOne({
      where: { id: idUtilisateur },
      relations: { contribuable: true },
    });
    if (!utilisateur || utilisateur.statut !== StatutCompte.ACTIF) {
      throw new UnauthorizedException("Ce compte n'est plus actif.");
    }
    return this.vuePublique(utilisateur, utilisateur.contribuable?.id);
  }

  async changerMotDePasse(
    idUtilisateur: string,
    donnees: ChangerMotDePasseDto,
  ) {
    const utilisateur = await this.utilisateurs
      .createQueryBuilder("utilisateur")
      .addSelect("utilisateur.motDePasseHash")
      .where("utilisateur.id = :idUtilisateur", { idUtilisateur })
      .getOne();
    if (!utilisateur) throw new UnauthorizedException("Compte introuvable.");
    if (
      !(await bcrypt.compare(
        donnees.motDePasseActuel,
        utilisateur.motDePasseHash,
      ))
    ) {
      throw new BadRequestException("Le mot de passe actuel est incorrect.");
    }

    utilisateur.motDePasseHash = await bcrypt.hash(
      donnees.nouveauMotDePasse,
      Number(this.configuration.get<string>("BCRYPT_ROUNDS", "12")),
    );
    utilisateur.changementMotDePasseRequis = false;
    await this.utilisateurs.save(utilisateur);
    return { message: "Le mot de passe a été modifié." };
  }

  private async reponseAvecJeton(
    utilisateur: UtilisateurEntity,
    idContribuable?: string,
  ) {
    const charge: UtilisateurAuthentifie = {
      id: utilisateur.id,
      courriel: utilisateur.courriel,
      nom: utilisateur.nom,
      role: utilisateur.role,
      ...(idContribuable ? { contribuableId: idContribuable } : {}),
      changementMotDePasseRequis: utilisateur.changementMotDePasseRequis,
    };
    const accessToken = await this.jetons.signAsync(charge);
    return {
      accessToken,
      tokenType: "Bearer",
      utilisateur: this.vuePublique(utilisateur, idContribuable),
    };
  }

  private vuePublique(utilisateur: UtilisateurEntity, idContribuable?: string) {
    return {
      id: utilisateur.id,
      nom: utilisateur.nom,
      courriel: utilisateur.courriel,
      role: utilisateur.role,
      statut: utilisateur.statut,
      changementMotDePasseRequis: utilisateur.changementMotDePasseRequis,
      creeLe: utilisateur.creeLe,
      derniereConnexion: utilisateur.derniereConnexion,
      ...(idContribuable ? { contribuableId: idContribuable } : {}),
    };
  }
}
