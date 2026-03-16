import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Policy } from './policy.entity';
import { User } from './user.entity';

@Entity('policy_promotions')
export class PolicyPromotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  policyId: string;

  @ManyToOne(() => Policy, (policy) => policy.promotions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'policyId' })
  policy: Policy;

  @Column({ length: 50, type: 'varchar' })
  fromStatus: string;

  @Column({ length: 50, type: 'varchar' })
  toStatus: string;

  @Column({ type: 'uuid', nullable: true })
  promotedById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'promotedById' })
  promotedBy: User;

  @Column({ type: 'text', nullable: true })
  note: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
