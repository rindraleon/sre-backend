import { IsEnum } from "class-validator";
import { AccountStatus } from "../../database/enums";

export class UpdateUserStatusDto {
  @IsEnum(AccountStatus, { message: "La valeur sélectionnée est invalide." })
  statut!: AccountStatus;
}
