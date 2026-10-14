import { RoleCompte } from "../../base-de-donnees/enums";

export interface UtilisateurAuthentifie {
  id: string;
  courriel: string;
  nom: string;
  role: RoleCompte;
  contribuableId?: string;
  changementMotDePasseRequis: boolean;
}
