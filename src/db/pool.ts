   import pg from "pg";

   export const pool = new pg.Pool({
     connectionString: process.env.DATABASE_URL ?? "postgresql://localhost:5432/farmer_registry",
   });