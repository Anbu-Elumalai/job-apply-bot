import { IsString, IsEmail, IsArray, IsNumber, IsOptional, ValidateNested, IsNotEmpty, IsBoolean } from "class-validator";
import { Type } from "class-transformer";

class PreferenceDto {
  @IsArray()
  @IsString({ each: true })
    jobTitles!: string[];

  @IsArray()
  @IsString({ each: true })
    locations!: string[];

  @IsArray()
  @IsString({ each: true })
    jobTypes!: ("Remote" | "Hybrid" | "On-Site")[];

  @IsNumber()
    salaryExpectationMin!: number;

  @IsString()
    salaryExpectationCurrency!: string;

  @IsNumber()
    matchingThresholdScore!: number;

  @IsBoolean()
    autoApply!: boolean;
}

export class UserProfileDto {
  @IsString()
  @IsNotEmpty()
    name!: string;

  @IsEmail()
    email!: string;

  @IsString()
  @IsNotEmpty()
    phoneNumber!: string;

  @IsString()
  @IsNotEmpty()
    currentTitle!: string;

  @IsArray()
  @IsString({ each: true })
    skills!: string[];

  @IsNumber()
    totalExperienceYears!: number;

  @ValidateNested()
  @Type(() => PreferenceDto)
    preferences!: PreferenceDto;

  @IsString()
  @IsNotEmpty()
    resumeUrl!: string;

  @IsString()
  @IsOptional()
    coverLetterTemplate?: string;
}

export class UpdatePlatformCredentialDto {
  @IsString()
  @IsNotEmpty()
    platform!: "linkedin" | "indeed" | "naukri" | "other";

  @IsString()
  @IsNotEmpty()
    username!: string;

  @IsString()
  @IsNotEmpty()
    password!: string;

  @IsArray()
  @IsOptional()
    cookies?: any[];
}
