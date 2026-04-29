const { Pool } = require('pg');
require('dotenv').config();

// Use DATABASE_URL if defined, otherwise fall back to POSTGRES_URL (Supabase/Vercel integration)
let connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

// If the connection string contains sslmode parameters, it can override the ssl config object and cause self-signed certificate errors.
if (connectionString) {
  connectionString = connectionString.split('?')[0];
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};