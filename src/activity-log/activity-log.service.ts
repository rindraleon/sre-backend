import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ActivityLogEntity } from "../database/entities/activity-log.entity";

export interface ActivityLogRow {
  id: string;
  acteurId?: string;
  acteur: string;
  role: string;
  action: string;
  ressource: string;
  referenceRessource: string;
  date: string;
  resultat: "SUCCES" | "ECHEC";
  details?: string;
}

/** Reads the activity log (audit) fed by the global interceptor. */
@Injectable()
export class ActivityLogService {
  constructor(
    @InjectRepository(ActivityLogEntity)
    private readonly activityLog: Repository<ActivityLogEntity>,
  ) {}

  async list(perPage?: string): Promise<ActivityLogRow[]> {
    const request = Number(perPage);
    const limite = Number.isFinite(request)
      ? Math.min(Math.max(Math.trunc(request), 1), 500)
      : 200;

    const entries = await this.activityLog.find({
      order: { createdAt: "DESC" },
      take: limite,
    });

    return entries.map((entry) => ({
      id: entry.id,
      acteurId: entry.actorId ?? undefined,
      acteur: entry.actorName,
      role: entry.role,
      action: entry.action,
      ressource: entry.resource,
      referenceRessource: entry.resourceReference ?? "—",
      date: entry.createdAt.toISOString(),
      resultat: entry.result,
      details: entry.details ?? undefined,
    }));
  }
}
