import {
  Entity,
  ObjectIdColumn,
  Column,
  Index,
  CreateDateColumn
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("job_posts")
@Index(["platform", "platformJobId"], { unique: true })
export class JobPost {
  @ObjectIdColumn()
    id!: ObjectId;

  @Column()
    platform!: string;

  @Column()
    platformJobId!: string;

  @Column()
    title!: string;

  @Column()
    companyName!: string;

  @Column()
    location!: string;

  @Column({ nullable: true })
    salaryText?: string;

  @Column()
    jobUrl!: string;

  @Column()
    description!: string;

  @Column({ nullable: true })
    matchScore?: number;

  @Column({ default: false })
    isProcessed!: boolean;

  @CreateDateColumn()
    scrapedAt!: Date;
}
