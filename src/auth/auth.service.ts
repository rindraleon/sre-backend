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
import { TaxpayerEntity } from "../database/entities/taxpayer.entity";
import { UserEntity } from "../database/entities/user.entity";
import { AccountRole, AccountStatus } from "../database/enums";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegistrationDto } from "./dto/registration.dto";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly utilisateurs: Repository<UserEntity>,
    private readonly sourceDeDonnees: DataSource,
    private readonly jetons: JwtService,
    private readonly configuration: ConfigService,
  ) {}

  async obtenirEtatInscription() {
    return {
      administrateurInitialise: await this.utilisateurs.exist({
        where: { role: AccountRole.ADMIN },
      }),
    };
  }

  async inscrire(donnees: RegistrationDto) {
    const courriel = donnees.courriel.trim().toLowerCase();
    const resultat = await this.sourceDeDonnees.transaction(
      async (gestionnaire) => {
        // Le verrou transactionnel empêche deux inscriptions simultanées d'obtenir le rôle administrateur initial.
        await gestionnaire.query(
          "SELECT pg_advisory_xact_lock($1)",
          [2026101201],
        );
        const depotUtilisateurs = gestionnaire.getRepository(UserEntity);
        const nombreUtilisateurs = await depotUtilisateurs.count();
        const role =
          nombreUtilisateurs === 0 ? AccountRole.ADMIN : AccountRole.CLIENT;

        if (await depotUtilisateurs.exist({ where: { courriel } })) {
          throw new ConflictException(
            "Cette adresse courriel est déjà utilisée.",
          );
        }
        if (role === AccountRole.CLIENT && !donnees.profil) {
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
        if (role === AccountRole.CLIENT && donnees.profil) {
          const depotContribuables = gestionnaire.getRepository(TaxpayerEntity);
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
          statut: AccountStatus.ACTIF,
          changementMotDePasseRequis: false,
          derniereConnexion: new Date(),
        });
        await depotUtilisateurs.save(nouvelUtilisateur);

        let contribuable: TaxpayerEntity | null = null;
        if (role === AccountRole.CLIENT && donnees.profil) {
          const depotContribuables = gestionnaire.getRepository(TaxpayerEntity);
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

  async connecter(donnees: LoginDto) {
    const courriel = donnees.courriel.trim().toLowerCase();
    const utilisateur = await this.utilisateurs
      .createQueryBuilder("utilisateur")
      .addSelect("utilisateur.motDePasseHash")
      .leftJoinAndSelect("utilisateur.contribuable", "contribuable")
      .where("LOWER(utilisateur.courriel) = :courriel", { courriel })
      .getOne();

    if (
      !utilisateur ||
      utilisateur.statut !== AccountStatus.ACTIF ||
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
    if (!utilisateur || utilisateur.statut !== AccountStatus.ACTIF) {
      throw new UnauthorizedException("Ce compte n'est plus actif.");
    }
    return this.vuePublique(utilisateur, utilisateur.contribuable?.id);
  }

  async changerMotDePasse(idUtilisateur: string, donnees: ChangePasswordDto) {
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
    utilisateur: UserEntity,
    idContribuable?: string,
  ) {
    const charge: AuthenticatedUser = {
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

  private vuePublique(utilisateur: UserEntity, idContribuable?: string) {
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
