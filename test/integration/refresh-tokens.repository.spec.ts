import { RefreshTokensRepository } from '../../src/feature/auth/repositories/refresh-tokens.repository';
import { users } from '../../src/schema';
import { TestDb, startTestDb, truncateAll } from './setup';

describe('RefreshTokensRepository (integration)', () => {
  let testDb: TestDb;
  let repo: RefreshTokensRepository;
  let userId: number;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = new RefreshTokensRepository(testDb.db);
  }, 120_000);

  afterAll(async () => {
    await testDb.shutdown();
  });

  beforeEach(async () => {
    await truncateAll(testDb.db);

    const [user] = await testDb.db
      .insert(users)
      .values({
        email: 'test@example.com',
        name: 'Test User',
        password: 'stored-hash',
        provider: 'local',
        emailVerified: false,
      })
      .returning();

    userId = user.id;
  });

  const makeToken = (
    overrides: Partial<{
      jti: string;
      expiresAt: Date;
      token: string;
    }> = {},
  ) => ({
    userId,
    token: 'stored-hash',
    jti: `jti-${Math.random().toString(36).slice(2)}`,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  });

  it('createRefreshToken persists a row and returns it', async () => {
    const data = makeToken();
    const [created] = await repo.createRefreshToken(data);

    expect(created.id).toBeDefined();
    expect(created.jti).toBe(data.jti);
    expect(created.userId).toBe(userId);
  });

  it('findByJti returns the row when it exists', async () => {
    const data = makeToken();
    await repo.createRefreshToken(data);

    const found = await repo.findByJti(data.jti);

    expect(found?.jti).toBe(data.jti);
  });

  it('findByJti returns undefined for an unknown jti', async () => {
    const found = await repo.findByJti('does-not-exist');
    expect(found).toBeUndefined();
  });

  it('deleteRefreshToken returns [{id}] when the row exists and removes it', async () => {
    const [created] = await repo.createRefreshToken(makeToken());

    const deleted = await repo.deleteRefreshToken(created.id);

    expect(deleted).toEqual([{ id: created.id }]);
    expect(await repo.findByJti(created.jti)).toBeUndefined();
  });

  it('deleteRefreshToken returns [] when the row does not exist (race signal)', async () => {
    const deleted = await repo.deleteRefreshToken(999_999);
    expect(deleted).toEqual([]);
  });

  it('deleteAllByUserId removes every token for the user', async () => {
    await repo.createRefreshToken(makeToken());
    await repo.createRefreshToken(makeToken());

    await repo.deleteAllByUserId(userId);

    const all = await repo.findTokensByUserId(userId);
    expect(all).toHaveLength(0);
  });

  it('deleteExpiredTokens removes expired rows and keeps fresh ones', async () => {
    await repo.createRefreshToken(
      makeToken({ expiresAt: new Date(Date.now() - 60_000) }),
    );
    await repo.createRefreshToken(
      makeToken({ expiresAt: new Date(Date.now() + 60_000) }),
    );

    await repo.deleteExpiredTokens();

    const remaining = await repo.findTokensByUserId(userId);
    expect(remaining).toHaveLength(1);
  });

  describe('runInTransaction', () => {
    it('commits the transaction on success', async () => {
      await repo.transaction.runInTransaction(async (tx) => {
        await repo.createRefreshToken(makeToken(), tx);
      });

      const all = await repo.findTokensByUserId(userId);
      expect(all).toHaveLength(1);
    });

    it('rolls back the transaction when the callback throws', async () => {
      await expect(
        repo.transaction.runInTransaction(async (tx) => {
          await repo.createRefreshToken(makeToken(), tx);
          throw new Error('rollback please');
        }),
      ).rejects.toThrow('rollback please');

      const all = await repo.findTokensByUserId(userId);
      expect(all).toHaveLength(0);
    });

    it('two concurrent deletes: exactly one returns the row, the other returns []', async () => {
      const [created] = await repo.createRefreshToken(makeToken());

      const [a, b] = await Promise.all([
        repo.deleteRefreshToken(created.id),
        repo.deleteRefreshToken(created.id),
      ]);

      const successes = [a, b].filter((r) => r.length > 0).length;
      expect(successes).toBe(1);
    });
  });
});
