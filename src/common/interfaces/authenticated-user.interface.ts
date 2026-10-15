import { AccountRole } from "../../database/enums";

export interface AuthenticatedUser {
  id: string;
  courriel: string;
  nom: string;
  role: AccountRole;
  contribuableId?: string;
  changementMotDePasseRequis: boolean;
}
