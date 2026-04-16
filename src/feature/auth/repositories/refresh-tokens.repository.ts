import { Inject, Injectable } from '@nestjs/common';
import { DrizzleAsyncProvider } from '../../../db/database/database.provider';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../../schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class RefreshTokens {
  constructor(
    @Inject(DrizzleAsyncProvider) private db: NodePgDatabase<typeof schema>,
  ) {}

  createRefreshToken(data: { userId: number; token: string; expiresAt: Date }) {
    return this.db.insert(schema.refresh_tokens).values(data).returning();
  }

  findRefreshToken(token: string) {
    return this.db.query.refresh_tokens.findFirst({
      where: eq(schema.refresh_tokens.token, token),
    });
  }

  deleteRefreshToken(token: string) {
    return this.db
      .delete(schema.refresh_tokens)
      .where(eq(schema.refresh_tokens.token, token));
  }
}
