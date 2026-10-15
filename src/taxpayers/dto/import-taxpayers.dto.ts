import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, ValidateNested } from "class-validator";
import { CreateTaxpayerDto } from "./create-taxpayer.dto";

export class ImportTaxpayersDto {
  @ApiProperty({ type: () => CreateTaxpayerDto, isArray: true, maxItems: 2000 })
  @IsArray({ message: "Ce champ doit être une liste." })
  @ArrayMaxSize(2000, {
    message: "La liste dépasse la taille maximale autorisée ($constraint1).",
  })
  @ValidateNested({ each: true })
  @Type(() => CreateTaxpayerDto)
  profils!: CreateTaxpayerDto[];
}
