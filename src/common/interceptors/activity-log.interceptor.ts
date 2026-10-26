import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { catchError, Observable, tap, throwError } from "rxjs";
import { ActivityLogEntity } from "../../database/entities/activity-log.entity";
import { AuthenticatedUser } from "../interfaces/authenticated-user.interface";

type TracedRequest = {
  method?: string;
  url?: string;
  route?: { path?: string };
  params?: Record<string, string>;
  user?: AuthenticatedUser;
};

/** Only actions that modify the system state are logged. */
const TRACED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const VERBS: Record<string, string> = {
  POST: "Création",
  PUT: "Mise à jour",
  PATCH: "Mise à jour",
  DELETE: "Suppression",
};

const RESOURCE_LABELS: Record<string, string> = {
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

const ACTION_LABELS: Record<string, string> = {
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

/** Global audit interceptor: logs every business action performed by an authenticated account (success and failure. */
@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(ActivityLogEntity)
    private readonly activityLog: Repository<ActivityLogEntity>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const request = context.switchToHttp().getRequest<TracedRequest>();
    const method = (request.method ?? "GET").toUpperCase();
    const user = request.user;
    if (!user || !TRACED_METHODS.has(method)) return next.handle();

    const path = request.route?.path ?? request.url?.split("?")[0] ?? "";
    const resource = this.resourceLabel(path);
    const action =
      ACTION_LABELS[`${method} ${path}`] ??
      `${VERBS[method] ?? method} — ${resource}`;

    return next.handle().pipe(
      tap((body) => {
        void this.save({
          user,
          action,
          resource,
          reference: this.extractReference(body, request.params),
          result: "SUCCES",
          details: `${method} ${path}`,
        });
      }),
      catchError((error: unknown) => {
        void this.save({
          user,
          action,
          resource,
          reference: this.extractReference(undefined, request.params),
          result: "ECHEC",
          details: `${method} ${path} — ${this.errorLabel(error)}`,
        });
        return throwError(() => error);
      }),
    );
  }

  private resourceLabel(path: string): string {
    const segment = path.split("/").filter(Boolean)[0] ?? "API";
    return RESOURCE_LABELS[segment] ?? segment;
  }

  private extractReference(
    body: unknown,
    params?: Record<string, string>,
  ): string | null {
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      for (const key of [
        "referenceInterne",
        "referenceFiscale",
        "numero",
        "reference",
        "nif",
        "id",
      ]) {
        const value = record[key];
        if (typeof value === "string" && value.trim())
          return value.slice(0, 120);
      }
    }
    const id = params ? Object.values(params)[0] : undefined;
    return id?.trim() ? id.slice(0, 120) : null;
  }

  private errorLabel(error: unknown): string {
    if (error && typeof error === "object") {
      const record = error as { message?: unknown; response?: { message?: unknown } };
      const message = record.response?.message ?? record.message;
      if (Array.isArray(message))
        return message.map(String).join(" · ").slice(0, 300);
      if (typeof message === "string" && message.trim())
        return message.slice(0, 300);
    }
    return "Échec de l’opération";
  }

  private async save(row: {
    user: AuthenticatedUser;
    action: string;
    resource: string;
    reference: string | null;
    result: "SUCCES" | "ECHEC";
    details: string;
  }): Promise<void> {
    try {
      await this.activityLog.insert({
        actorId: row.user.id,
        actorName: row.user.name?.slice(0, 160) || row.user.email,
        role: row.user.role,
        action: row.action.slice(0, 80),
        resource: row.resource.slice(0, 80),
        resourceReference: row.reference,
        result: row.result,
        details: row.details.slice(0, 1000),
      });
    } catch {
      // The log must never make the business request fail.
    }
  }
}
