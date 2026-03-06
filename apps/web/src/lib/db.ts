import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://veilmap:password@localhost:5432/veilmap';

const db = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export { db };
