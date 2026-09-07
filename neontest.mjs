import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.NEON_DATABASE_URL);
try {
  const r = await sql`select count(*) as users from users`;
  console.log('APP CONNECTION SEES:', r);
} catch (e) {
  console.log('FAIL', e.message);
}