import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { ImpersonationLog } from '../impersonation-log.entity';

describe('ImpersonationLog entity metadata', () => {
  it('maps to the impersonation_logs table', () => {
    const tables = getMetadataArgsStorage().tables;
    const table = tables.find((t) => t.target === ImpersonationLog);
    expect(table).toBeDefined();
    expect(table!.name).toBe('impersonation_logs');
  });

  it('has the expected bracket columns', () => {
    const cols = getMetadataArgsStorage().columns.filter(
      (c) => c.target === ImpersonationLog,
    );
    const names = cols.map((c) => c.propertyName);
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'adminId',
        'impersonatedUserId',
        'startAt',
        'endAt',
        'durationSeconds',
      ]),
    );
  });

  it('endAt defaults to null (open bracket)', () => {
    const log = new ImpersonationLog();
    expect(log.endAt).toBeNull();
  });

  it('durationSeconds defaults to null', () => {
    const log = new ImpersonationLog();
    expect(log.durationSeconds).toBeNull();
  });

  it('has index on adminId', () => {
    const indices = getMetadataArgsStorage().indices.filter(
      (i) => i.target === ImpersonationLog,
    );
    const onAdmin = indices.some(
      (i) => Array.isArray(i.columns) && (i.columns as string[]).includes('adminId'),
    );
    expect(onAdmin).toBe(true);
  });

  it('has index on impersonatedUserId', () => {
    const indices = getMetadataArgsStorage().indices.filter(
      (i) => i.target === ImpersonationLog,
    );
    const onSubject = indices.some(
      (i) =>
        Array.isArray(i.columns) &&
        (i.columns as string[]).includes('impersonatedUserId'),
    );
    expect(onSubject).toBe(true);
  });
});
