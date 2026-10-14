import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, ValidateNested } from "class-validator";
import { CreerContribuableDto } from "./creer-contribuable.dto";

export class ImporterContribuablesDto {
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => CreerContribuableDto)
  profils!: CreerContribuableDto[];
}
