// db/migrate.ts
// Run with: npx tsx db/migrate.ts

import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://veilmap:password@localhost:5432/veilmap';

async function migrate() {
  const sql = postgres(DATABASE_URL);
  const schemaPath = resolve(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  console.log('Running migration...');
  await sql.unsafe(schema);
  console.log('Migration complete.');

  await sql.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
