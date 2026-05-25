import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("system_telemetry")
export class SystemTelemetry {
  @ObjectIdColumn()
    id!: ObjectId;

  @Column()
    action!: "SCRAPING" | "APPLYING" | "SYSTEM_MAINTENANCE";

  @Column()
    level!: "INFO" | "WARN" | "ERROR";

  @Column()
    message!: string;

  @Column({ nullable: true })
    details?: string;

  @CreateDateColumn()
    timestamp!: Date;
}
