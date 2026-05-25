import { IsString, IsNotEmpty, IsEnum, IsOptional } from "class-validator";

export class UpdateApplicationStatusDto {
  @IsString()
  @IsNotEmpty()
  @IsEnum(["MATCHED", "APPLYING", "APPLIED", "MANUAL_REVIEW", "INTERVIEW_INVITED", "REJECTED", "OFFERED"])
    status!: "MATCHED" | "APPLYING" | "APPLIED" | "MANUAL_REVIEW" | "INTERVIEW_INVITED" | "REJECTED" | "OFFERED";
}

export class CreateManualApplicationDto {
  @IsString()
  @IsNotEmpty()
    title!: string;

  @IsString()
  @IsNotEmpty()
    companyName!: string;

  @IsString()
  @IsNotEmpty()
    location!: string;

  @IsString()
  @IsOptional()
    salaryText?: string;

  @IsString()
  @IsNotEmpty()
    jobUrl!: string;

  @IsString()
  @IsNotEmpty()
    description!: string;

  @IsString()
  @IsNotEmpty()
    platform!: string;

  @IsString()
  @IsNotEmpty()
    platformJobId!: string;
}
