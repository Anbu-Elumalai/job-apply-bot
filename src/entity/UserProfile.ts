import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("user_profiles")
export class UserProfile {
  @ObjectIdColumn()
    id!: ObjectId;

  @Column()
    name!: string;

  @Column()
    email!: string;

  @Column()
    phoneNumber!: string;

  @Column()
    currentTitle!: string;

  @Column("simple-array")
    skills!: string[];

  @Column()
    totalExperienceYears!: number;

  @Column("simple-json")
    preferences!: {
    jobTitles: string[];
    locations: string[];
    jobTypes: ("Remote" | "Hybrid" | "On-Site")[];
    salaryExpectationMin: number;
    salaryExpectationCurrency: string;
    matchingThresholdScore: number;
    autoApply: boolean;
  };

  @Column()
    resumeUrl!: string;

  @Column({ nullable: true })
    coverLetterTemplate?: string;

  @CreateDateColumn()
    createdAt!: Date;

  @UpdateDateColumn()
    updatedAt!: Date;
}
