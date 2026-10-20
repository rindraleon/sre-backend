import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { catchError, Observable, tap, throwError } from "rxjs";
import { ActivityLogEntity } from "../../database/entities/activity-log.entity";
import { AuthenticatedUser } from "../interfaces/authenticated-user.interface";

type RequeteTracee = {
  method?: string;
  url?: string;
  route?: { path?: string };
  params?: Record<string, string>;
  user?: AuthenticatedUser;
};

/** Seules les actions qui modifient l'état du système sont journalisées. */
const METHODES_TRACEES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const VERBES: Record<string, string> = {
  POST: "Création",
  PUT: "Mise à jour",
  PATCH: "Mise à jour",
  DELETE: "Suppression",
};

const LIBELLES_RESSOURCE: Record<string, string> = {
  auth: "Authentification",
  utilisateurs: "Compte utilisateur",
  contribuables: "Contribuable",
  "types-impots": "Type d’impôt",
  obligations: "Obligation fiscale",
  paiements: "Paiement",
  documents: "Document",
  notifications: "Notification",
  admin: "Administration",
  contact: "Contact public",
};

const LIBELLES_ACTION: Record<string, string> = {
  "POST /paiements": "Déclaration de paiement soumise",
  "PATCH /paiements/:id/decision": "Décision administrative enregistrée",
  "POST /contribuables": "Création d’un contribuable",
  "POST /contribuables/import": "Import de contribuables (Excel)",
  "DELETE /contribuables/:id": "Suppression d’un contribuable",
  "PATCH /contribuables/moi": "Profil fiscal mis à jour",
  "PATCH /utilisateurs/:id/statut": "Statut d’un compte modifié",
  "POST /types-impots": "Création d’un type d’impôt",
  "PATCH /types-impots/:id": "Type d’impôt modifié",
  "PATCH /types-impots/:id/activite": "Activité d’un type d’impôt modifiée",
  "POST /obligations": "Création d’une obligation fiscale",
  "PATCH /auth/mot-de-passe": "Mot de passe modifié",
  "POST /auth/mot-de-passe": "Mot de passe modifié",
  "POST /admin/notifications/groupes": "Campagne de notifications envoyée",
  "PATCH /notifications/:id/lue": "Notification marquée comme lue",
  "PATCH /notifications/toutes-lues": "Notifications marquées comme lues",
  "PATCH /notifications/:id": "Notification mise à jour",
};

/**
 * Intercepteur global d'audit : journalise chaque action métier réalisée par un
 * compte authentifié (succès comme échec). L'écriture est détachée et
 * best-effort : le journal ne doit jamais faire échouer une requête.
 */
@Injectable()
export class JournalActiviteInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(ActivityLogEntity)
    private readonly journal: Repository<ActivityLogEntity>,
  ) {}

  intercept(context: ExecutionContext, suivant: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return suivant.handle();

    const requete = context.switchToHttp().getRequest<RequeteTracee>();
    const methode = (requete.method ?? "GET").toUpperCase();
    const utilisateur = requete.user;
    if (!utilisateur || !METHODES_TRACEES.has(methode)) return suivant.handle();

    const chemin = requete.route?.path ?? requete.url?.split("?")[0] ?? "";
    const ressource = this.libellerRessource(chemin);
    const action =
      LIBELLES_ACTION[`${methode} ${chemin}`] ??
      `${VERBES[methode] ?? methode} — ${ressource}`;

    return suivant.handle().pipe(
      tap((corps) => {
        void this.enregistrer({
          utilisateur,
          action,
          ressource,
          reference: this.extraireReference(corps, requete.params),
          resultat: "SUCCES",
          details: `${methode} ${chemin}`,
        });
      }),
      catchError((erreur: unknown) => {
        void this.enregistrer({
          utilisateur,
          action,
          ressource,
          reference: this.extraireReference(undefined, requete.params),
          resultat: "ECHEC",
          details: `${methode} ${chemin} — ${this.libellerErreur(erreur)}`,
        });
        return throwError(() => erreur);
      }),
    );
  }

  private libellerRessource(chemin: string): string {
    const segment = chemin.split("/").filter(Boolean)[0] ?? "API";
    return LIBELLES_RESSOURCE[segment] ?? segment;
  }

  private extraireReference(
    corps: unknown,
    params?: Record<string, string>,
  ): string | null {
    if (corps && typeof corps === "object") {
      const objet = corps as Record<string, unknown>;
      for (const cle of [
        "referenceInterne",
        "referenceFiscale",
        "numero",
        "reference",
        "nif",
        "id",
      ]) {
        const valeur = objet[cle];
        if (typeof valeur === "string" && valeur.trim())
          return valeur.slice(0, 120);
      }
    }
    const identifiant = params ? Object.values(params)[0] : undefined;
    return identifiant?.trim() ? identifiant.slice(0, 120) : null;
  }

  private libellerErreur(erreur: unknown): string {
    if (erreur && typeof erreur === "object") {
      const objet = erreur as { message?: unknown; response?: { message?: unknown } };
      const message = objet.response?.message ?? objet.message;
      if (Array.isArray(message))
        return message.map(String).join(" · ").slice(0, 300);
      if (typeof message === "string" && message.trim())
        return message.slice(0, 300);
    }
    return "Échec de l’opération";
  }

  private async enregistrer(ligne: {
    utilisateur: AuthenticatedUser;
    action: string;
    ressource: string;
    reference: string | null;
    resultat: "SUCCES" | "ECHEC";
    details: string;
  }): Promise<void> {
    try {
      await this.journal.insert({
        acteurId: ligne.utilisateur.id,
        acteurNom: ligne.utilisateur.nom?.slice(0, 160) || ligne.utilisateur.courriel,
        role: ligne.utilisateur.role,
        action: ligne.action.slice(0, 80),
        ressource: ligne.ressource.slice(0, 80),
        referenceRessource: ligne.reference,
        resultat: ligne.resultat,
        details: ligne.details.slice(0, 1000),
      });
    } catch {
      // Le journal ne doit jamais faire échouer la requête métier.
    }
  }
}
