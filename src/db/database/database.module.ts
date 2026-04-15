import { Module } from '@nestjs/common';
import { DrizzleAsyncProvider, drizzleProvider } from './database.provider';

@Module({
  providers: [...drizzleProvider],
  exports: [DrizzleAsyncProvider],
})
export class DatabaseModule {}
