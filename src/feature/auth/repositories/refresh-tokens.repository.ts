import { Inject, Injectable } from '@nestjs/common';
import { DrizzleAsyncProvider } from '@db/database/database.provider';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@src/schema';
import { eq, lt } from 'drizzle-orm';
import { RefreshTokenType } from '../schemas/refresh-token.schema';
import { Tx } from '@common/types/transaction.type';

@Injectable()
export class RefreshTokensRepository {
  constructor(
    @Inject(DrizzleAsyncProvider) private db: NodePgDatabase<typeof schema>,
  ) {}

  createRefreshToken(data: RefreshTokenType, tx?: Tx) {
    return (tx || this.db)
      .insert(schema.refresh_tokens)
      .values(data)
      .returning();
  }

  findTokensByUserId(userId: number, tx?: Tx) {
    return (tx || this.db).query.refresh_tokens.findMany({
      where: eq(schema.refresh_tokens.userId, userId),
    });
  }

  deleteRefreshToken(id: number, tx?: Tx) {
    return (tx || this.db)
      .delete(schema.refresh_tokens)
      .where(eq(schema.refresh_tokens.id, id))
      .returning({ id: schema.refresh_tokens.id });
  }

  findByJti(jti: string, tx?: Tx) {
    return (tx || this.db).query.refresh_tokens.findFirst({
      where: eq(schema.refresh_tokens.jti, jti),
    });
  }

  deleteExpiredTokens(tx?: Tx) {
    return (tx || this.db)
      .delete(schema.refresh_tokens)
      .where(lt(schema.refresh_tokens.expiresAt, new Date()));
  }

  deleteAllByUserId(userId: number, tx?: Tx) {
    return (tx || this.db)
      .delete(schema.refresh_tokens)
      .where(eq(schema.refresh_tokens.userId, userId));
  }

  runInTransaction<T>(cb: (tx: Tx) => Promise<T>) {
    return this.db.transaction(cb);
  }
}
