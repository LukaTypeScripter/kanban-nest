import { Inject, Injectable } from '@nestjs/common';
import { DrizzleAsyncProvider } from '@db/database/database.provider';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@src/schema';
import { eq, lt } from 'drizzle-orm';
import { RefreshTokenType } from '../schemas/refresh-token.schema';

@Injectable()
export class RefreshTokensRepository {
  constructor(
    @Inject(DrizzleAsyncProvider) private db: NodePgDatabase<typeof schema>,
  ) {}

  createRefreshToken(data: RefreshTokenType) {
    return this.db.insert(schema.refresh_tokens).values(data).returning();
  }

  findTokensByUserId(userId: number) {
    return this.db.query.refresh_tokens.findMany({
      where: eq(schema.refresh_tokens.userId, userId),
    });
  }

  deleteRefreshToken(id: number) {
    return this.db
      .delete(schema.refresh_tokens)
      .where(eq(schema.refresh_tokens.id, id));
  }

  findByJti(jti: string) {
    return this.db.query.refresh_tokens.findFirst({
      where: eq(schema.refresh_tokens.jti, jti),
    });
  }

  deleteExpiredTokens() {
    return this.db
      .delete(schema.refresh_tokens)
      .where(lt(schema.refresh_tokens.expiresAt, new Date()));
  }
}
