import { Inject, Injectable } from '@nestjs/common';
import { DrizzleAsyncProvider } from '../../db/database/database.provider';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../../schema';
import { UsersType } from '../auth/schemas/users.schema';

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(DrizzleAsyncProvider)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

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
}
