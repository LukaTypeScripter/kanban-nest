import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@src/schema';
import { Tx } from '@common/types/transaction.type';

export class RunInTransactionUtility {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  runInTransaction<T>(cb: (tx: Tx) => Promise<T>) {
    return this.db.transaction(cb);
  }
}
