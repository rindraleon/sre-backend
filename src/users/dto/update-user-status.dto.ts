import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { AccountStatus } from "../../database/enums";

export class UpdateUserStatusDto {
  @ApiProperty({ enum: AccountStatus })
  @IsEnum(AccountStatus, { message: "La valeur sélectionnée est invalide." })
  statut!: AccountStatus;
}
