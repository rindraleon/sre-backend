import { AccountRole } from "../../database/enums";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
  taxpayerId?: string;
  mustChangePassword: boolean;
  /** Profile completed / verified (initial setup). */
  isProfileComplete: boolean;
}
