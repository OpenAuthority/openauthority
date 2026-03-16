import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { PolicyVersion } from './policy-version.entity';
import { PolicyPromotion } from './policy-promotion.entity';

export enum PolicyStatus {
  DRAFT = 'draft',
  REVIEW = 'review',
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
}

@Entity('policies')
export class Policy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.policies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'jsonb' })
  spec: Record<string, unknown>;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ length: 50, type: 'varchar', default: PolicyStatus.DRAFT })
  status: PolicyStatus;

  @Column({ type: 'uuid', nullable: true })
  createdById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ type: 'uuid', nullable: true })
  reviewedById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewedById' })
  reviewedBy: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  promotedAt: Date;

  @OneToMany(() => PolicyVersion, (pv) => pv.policy)
  versions: PolicyVersion[];

  @OneToMany(() => PolicyPromotion, (pp) => pp.policy)
  promotions: PolicyPromotion[];
}
