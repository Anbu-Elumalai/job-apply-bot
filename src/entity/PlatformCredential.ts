import {
  Entity,
  ObjectIdColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity("platform_credentials")
export class PlatformCredential {
  @ObjectIdColumn()
    id!: ObjectId;

  @Column()
    platform!: "linkedin" | "indeed" | "naukri" | "other";

  @Column()
    username!: string;

  @Column()
    encryptedPassword!: string;

  @Column()
    encryptionIv!: string;

  @Column("simple-json", { nullable: true })
    cookies?: any[];

  @Column({ default: true })
    isActive!: boolean;

  @CreateDateColumn()
    createdAt!: Date;

  @UpdateDateColumn()
    updatedAt!: Date;
}
