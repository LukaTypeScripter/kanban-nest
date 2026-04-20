import { UsersRepository } from '../../src/feature/users/users.repository';
import { TestDb, startTestDb, truncateAll } from './setup';

describe('UsersRepository (integration)', () => {
  let testDb: TestDb;
  let repo: UsersRepository;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = new UsersRepository(testDb.db);
  }, 120_000);

  afterAll(async () => {
    await testDb.shutdown();
  });

  beforeEach(async () => {
    await truncateAll(testDb.db);
  });

  const userFixture = {
    email: 'alice@example.com',
    name: 'Alice',
    password: 'hashed-pw',
    avatar: null,
  };

  describe('create', () => {
    it('inserts a user and returns the persisted row with an id', async () => {
      const [created] = await repo.create(userFixture);

      expect(created.id).toBeGreaterThan(0);
      expect(created.email).toBe(userFixture.email);
      expect(created.createdAt).toBeInstanceOf(Date);
    });

    it('throws when the email is not unique', async () => {
      await repo.create(userFixture);

      await expect(repo.create(userFixture)).rejects.toThrow();
    });
  });

  describe('findByEmail', () => {
    it('returns the user when the email exists', async () => {
      await repo.create(userFixture);

      const found = await repo.findByEmail(userFixture.email);

      expect(found?.email).toBe(userFixture.email);
    });

    it('returns undefined when the email does not exist', async () => {
      const found = await repo.findByEmail('nobody@example.com');
      expect(found).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('returns the user when the id exists', async () => {
      const [created] = await repo.create(userFixture);

      const found = await repo.findById(created.id);

      expect(found?.id).toBe(created.id);
    });

    it('returns undefined when the id does not exist', async () => {
      const found = await repo.findById(999_999);
      expect(found).toBeUndefined();
    });
  });
});
