import 'dotenv/config';
import postgres from 'postgres';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

/** Build a Drizzle db over the Supabase connection string. `prepare:false` keeps it safe behind the transaction pooler. */
export function createDb(url: string): Db {
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema });
}
