/**
 * Test-only entity for Phase A smoke e2e (A19).
 * Used to verify the structural tenant filter end-to-end.
 * Only registered in test environment.
 */
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('test_tenant_items')
export class TestTenantItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'trainer_id' })
  trainerId!: string;

  @Column()
  name!: string;
}
