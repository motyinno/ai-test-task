import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DatabaseModule } from '../database.module';

describe('DatabaseModule', () => {
  it('provides a connected DataSource', async () => {
    const mod = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile();
    const ds = mod.get(DataSource);
    expect(ds.isInitialized).toBe(true);
    await mod.close();
  });
});
