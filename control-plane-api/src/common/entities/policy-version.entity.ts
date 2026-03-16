import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Policy } from './policy.entity';
import { User } from './user.entity';

@Entity('policy_versions')
@Unique(['policyId', 'version'])
export class PolicyVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  policyId: string;

  @ManyToOne(() => Policy, (policy) => policy.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'policyId' })
  policy: Policy;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'jsonb' })
  spec: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  changelog: string;

  @Column({ type: 'uuid', nullable: true })
  createdById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
