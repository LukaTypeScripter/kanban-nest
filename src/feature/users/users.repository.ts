import { Inject, Injectable } from '@nestjs/common';
import { DrizzleAsyncProvider } from '@db/database/database.provider';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '@src/schema';
import { UsersType } from '@feature/auth/schemas/users.schema';
import { Tx } from '@common/types/transaction.type';
import { RunInTransactionUtility } from '@common/utility/run-in-transaction.utility';

@Injectable()
export class UsersRepository {
  transaction: RunInTransactionUtility;
  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {
    this.transaction = new RunInTransactionUtility(this.db);
  }

  findByEmail(email: string) {
    return this.db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
  }

  findById(id: number) {
    return this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });
  }

  create(data: UsersType) {
    return this.db.insert(schema.users).values(data).returning();
  }

  update(id: number, data: Partial<UsersType>, tx?: Tx) {
    return (tx || this.db)
      .update(schema.users)
      .set(data)
      .where(eq(schema.users.id, id))
      .returning();
  }
}
