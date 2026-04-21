import { Inject, Injectable } from '@nestjs/common';
import { DrizzleAsyncProvider } from '@db/database/database.provider';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@src/schema';
import { eq, lt } from 'drizzle-orm';
import { Tx } from '@common/types/transaction.type';
import { EmailVerificationType } from '../schemas/email-verification.schema';
import { RunInTransactionUtility } from '@common/utility/run-in-transaction.utility';

@Injectable()
export class EmailVerificationRepository {
  transaction: RunInTransactionUtility;
  constructor(
    @Inject(DrizzleAsyncProvider) private db: NodePgDatabase<typeof schema>,
  ) {
    this.transaction = new RunInTransactionUtility(this.db);
  }

  createEmailVerification(data: EmailVerificationType, tx?: Tx) {
    return (tx || this.db)
      .insert(schema.email_verifications)
      .values(data)
      .returning();
  }

  findByTokenHash(tokenHash: string, tx?: Tx) {
    return (tx || this.db).query.email_verifications.findFirst({
      where: eq(schema.email_verifications.tokenHash, tokenHash),
    });
  }

  deleteById(id: number, tx?: Tx) {
    return (tx || this.db)
      .delete(schema.email_verifications)
      .where(eq(schema.email_verifications.id, id))
      .returning({ id: schema.email_verifications.id });
  }

  deleteByUserId(userId: number, tx?: Tx) {
    return (tx || this.db)
      .delete(schema.email_verifications)
      .where(eq(schema.email_verifications.userId, userId))
      .returning({ id: schema.email_verifications.id });
  }

  deleteExpired(tx?: Tx) {
    return (tx || this.db)
      .delete(schema.email_verifications)
      .where(lt(schema.email_verifications.expiresAt, new Date()));
  }
}
