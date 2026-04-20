import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@src/schema';

export type Tx = Parameters<
  NodePgDatabase<typeof schema>['transaction']
>[0] extends (tx: infer T) => any
  ? T
  : never;
