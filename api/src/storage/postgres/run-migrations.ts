import { runMigrations } from './client';

await runMigrations();
console.log('Migrations completed successfully');
process.exit(0);
