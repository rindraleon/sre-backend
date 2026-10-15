import { SetMetadata } from "@nestjs/common";
import { AccountRole } from "../../database/enums";

export const ROLES_KEY = "roles_autorises";
export const Roles = (...roles: AccountRole[]) => SetMetadata(ROLES_KEY, roles);
