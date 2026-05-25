import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("job_applications")
export class JobApplication {
  @ObjectIdColumn()
    id!: ObjectId;

  @Column()
    jobId!: ObjectId; // Ref to JobPost

  @Column()
    userProfileId!: ObjectId; // Ref to UserProfile

  @Column()
    status!: "MATCHED" | "APPLYING" | "APPLIED" | "MANUAL_REVIEW" | "INTERVIEW_INVITED" | "REJECTED" | "OFFERED";

  @Column({ nullable: true })
    appliedAt?: Date;

  @Column("simple-json", { nullable: true })
    submissionDetails?: {
    coverLetterUsed?: string;
    resumeVersionUsed?: string;
    errorMessage?: string;
    formResponseSnapshots?: any;
  };

  @Column("simple-json")
    auditLogs!: {
    timestamp: Date;
    status: string;
    message: string;
  }[];

  @CreateDateColumn()
    createdAt!: Date;

  @UpdateDateColumn()
    updatedAt!: Date;
}
