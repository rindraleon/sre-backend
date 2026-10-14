import { SetMetadata } from "@nestjs/common";
import { RoleCompte } from "../../base-de-donnees/enums";

export const CLE_ROLES = "roles_autorises";
export const RolesAutorises = (...roles: RoleCompte[]) =>
  SetMetadata(CLE_ROLES, roles);
