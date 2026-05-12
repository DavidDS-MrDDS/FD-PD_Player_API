const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const db = require('./db');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const secretKey = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Subida de archivos (49MB de peso máximo)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 49 * 1024 * 1024 },
});

// Conexión con Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Verificación de token
function verifyToken(req, res, next) {
  const bearerHeader = req.headers['authorization'];

  if (!bearerHeader) {
    return res.status(403).json({ message: "No tienes permiso. Token requerido." });
  }

  const bearer = bearerHeader.split(' ');
  const bearerToken = bearer[1];

  if (!bearerToken) {
    return res.status(403).json({ message: "Token inválido." });
  }

  jwt.verify(bearerToken, secretKey, (err, authData) => {
    if (err) {
      return res.status(403).json({
        message: "Debes iniciar sesión",
        details: err.message
      });
    }

    req.user = authData;
    next();
  });
}

// Register route
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email and password required' });
  }

  try {
    // Check if user exists
    const userCheck = await db.query('SELECT * FROM users WHERE username = $1 OR email = $2', [username, email]);
    if (userCheck.rows.length > 0) {
      return res.status(409).json({ message: 'Username or email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const newUser = await db.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username',
      [username, email, hashedPassword]
    );

    res.status(201).json({ message: 'User registered successfully', user: newUser.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Error registering user' });
  }
});

// Login route
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }

  try {
    // Find user
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Validate password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate token
    jwt.sign({ id: user.id, username: user.username }, secretKey, (err, token) => {
      if (err) {
        return res.status(500).json({ message: 'Error generating token' });
      }
      res.json({ token, user: { id: user.id, username: user.username } });
    });
  } catch (err) {
    res.status(500).json({ message: 'Error logging in' });
  }
});

app.get('/api/favorites', verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT fs.*, u.username
      FROM favorite_songs fs
      JOIN users u ON fs.user_id = u.id
      WHERE fs.user_id = $1
      ORDER BY fs.created_at DESC
      `,
      [req.user.id]
    );

    res.json({ songs: result.rows });
  } catch (err) {
    res.status(500).json({
      message: 'Error getting user favorites',
      details: err.message
    });
  }
});

app.get('/api/public/favorites', verifyToken, async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 10);
    const offset = (pageNumber - 1) * limitNumber;

    let queryText = `
      SELECT fs.*, u.username
      FROM favorite_songs fs
      JOIN users u ON fs.user_id = u.id
    `;

    let queryParams = [];

    if (search && search.trim() !== '') {
      queryText += ` WHERE fs.nombre ILIKE $1 OR fs.artista ILIKE $1 OR fs.album ILIKE $1`;
      queryParams.push(`%${search.trim()}%`);
    }

    queryText += ` ORDER BY fs.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limitNumber, offset);

    const result = await db.query(queryText, queryParams);

    res.json({ songs: result.rows });
  } catch (err) {
    res.status(500).json({
      message: 'Error getting public songs',
      details: err.message
    });
  }
});

app.post('/api/favorites/get-upload-url', verifyToken, async (req, res) => {
  try {
    const { song_key } = req.body;

    if (!song_key) {
      return res.status(400).json({ message: 'song_key required' });
    }

    const filePath = `${req.user.id}/${song_key}.mp3`;

    const { data, error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .createSignedUploadUrl(filePath, { upsert: true });

    if (error) {
      throw error;
    }

    const { data: publicData } = supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .getPublicUrl(filePath);

    res.json({
      signedUrl: data.signedUrl,
      path: filePath,
      publicUrl: publicData.publicUrl
    });

  } catch (err) {
    console.error('Error generating upload URL:', err);

    res.status(500).json({
      message: 'Error generating upload URL',
      details: err.message
    });
  }
});

app.post('/api/favorites/confirm-upload', verifyToken, async (req, res) => {
  try {
    const { song_key, nombre, artista, album } = req.body;

    if (!song_key || !nombre) {
      return res.status(400).json({
        message: 'song_key and nombre required'
      });
    }

    const filePath = `${req.user.id}/${song_key}.mp3`;

    const { data: publicData } = supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .getPublicUrl(filePath);

    const result = await db.query(
      `
      INSERT INTO favorite_songs
      (user_id, song_key, nombre, artista, album, ruta_archivo, storage_path)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, song_key)
      DO UPDATE SET
        nombre = EXCLUDED.nombre,
        artista = EXCLUDED.artista,
        album = EXCLUDED.album,
        ruta_archivo = EXCLUDED.ruta_archivo,
        storage_path = EXCLUDED.storage_path,
        created_at = NOW()
      RETURNING *
      `,
      [
        req.user.id,
        song_key,
        nombre,
        artista || '',
        album || null,
        publicData.publicUrl,
        filePath
      ]
    );

    res.status(201).json({
      message: 'Canción añadida a favoritos',
      favorite: result.rows[0]
    });

  } catch (err) {
    console.error('Error confirming upload:', err);

    res.status(500).json({
      message: 'Error confirming upload',
      details: err.message
    });
  }
});

// Ruta para borrar canciones
app.delete('/api/favorites/:songKey', verifyToken, async (req, res) => {
  try {
    const { songKey } = req.params;

    const existing = await db.query(
      'SELECT storage_path FROM favorite_songs WHERE user_id = $1 AND song_key = $2 LIMIT 1',
      [req.user.id, songKey]
    );

    const storagePath = existing.rows.length > 0 && existing.rows[0].storage_path
      ? existing.rows[0].storage_path
      : `${req.user.id}/${songKey}.mp3`;

    const { error: storageError } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .remove([storagePath]);

    if (storageError) {
      console.error("Storage delete error:", storageError);
    }

    await db.query(
      'DELETE FROM favorite_songs WHERE user_id = $1 AND song_key = $2',
      [req.user.id, songKey]
    );

    res.json({ message: 'Favorito eliminado' });
  } catch (err) {
    res.status(500).json({
      message: 'Error deleting song',
      details: err.message
    });
  }
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});

module.exports = app;