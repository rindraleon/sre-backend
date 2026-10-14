import { IsOptional, IsString, Length } from "class-validator";

export class ModifierProfilContribuableDto {
  @IsOptional()
  @IsString()
  @Length(3, 220)
  adresse?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  ville?: string;

  @IsOptional()
  @IsString()
  @Length(7, 40)
  telephone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 180)
  nomCommercial?: string;
}
