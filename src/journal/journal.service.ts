import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ActivityLogEntity } from "../database/entities/activity-log.entity";

export interface LigneJournal {
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

/**
 * Lecture du journal d'activité (audit) alimenté par l'intercepteur global.
 * Réservé à l'administration : les lignes sont renvoyées de la plus récente
 * à la plus ancienne.
 */
@Injectable()
export class JournalService {
  constructor(
    @InjectRepository(ActivityLogEntity)
    private readonly journal: Repository<ActivityLogEntity>,
  ) {}

  async lister(parPage?: string): Promise<LigneJournal[]> {
    const demande = Number(parPage);
    const limite = Number.isFinite(demande)
      ? Math.min(Math.max(Math.trunc(demande), 1), 500)
      : 200;

    const entrees = await this.journal.find({
      order: { creeLe: "DESC" },
      take: limite,
    });

    return entrees.map((entree) => ({
      id: entree.id,
      acteurId: entree.acteurId ?? undefined,
      acteur: entree.acteurNom,
      role: entree.role,
      action: entree.action,
      ressource: entree.ressource,
      referenceRessource: entree.referenceRessource ?? "—",
      date: entree.creeLe.toISOString(),
      resultat: entree.resultat,
      details: entree.details ?? undefined,
    }));
  }
}
