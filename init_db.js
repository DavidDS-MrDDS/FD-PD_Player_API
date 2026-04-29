const db = require('./db');

async function initDb() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS favorite_songs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        song_key VARCHAR(500) NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        artista VARCHAR(255) NOT NULL,
        album VARCHAR(255),
        ruta_archivo TEXT NOT NULL,
        storage_path TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (user_id, song_key)
      );
    `);

    await db.query(`
      ALTER TABLE favorite_songs
      ADD COLUMN IF NOT EXISTS storage_path TEXT;
    `);

    console.log('Tablas creadas o actualizadas correctamente.');
  } catch (err) {
    console.error('Error creando o actualizando tablas:', err);
  } finally {
    process.exit();
  }
}

initDb();