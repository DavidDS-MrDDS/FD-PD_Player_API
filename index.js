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
  if (typeof bearerHeader !== 'undefined') {
    const bearer = bearerHeader.split(' ');
    const bearerToken = bearer[1];
    req.token = bearerToken;
    next();
  } else {
    res.status(403).json({ message: "No tienes permiso. Token requerido." });
  }
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

// Ruta para ver las canciones (necesita estar logueado)
app.get('/api/public/favorites', verifyToken, (req, res) => {
  jwt.verify(req.token, secretKey, async (err, authData) => {
    if (err) {
      res.status(403).json({ message: "Debes iniciar sesión para ver las canciones" });
    } else {
      try {
        const { search, page = 1, limit = 10 } = req.query;
        const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

        let queryText = `SELECT fs.*, u.username FROM favorite_songs fs JOIN users u ON fs.user_id = u.id`;
        let queryParams = [];

        if (search) {
          queryText += ` WHERE fs.nombre ILIKE $1 OR fs.artista ILIKE $1`;
          queryParams.push(`%${search}%`);
        }

        queryText += ` ORDER BY fs.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        queryParams.push(parseInt(limit), offset);

        const result = await db.query(queryText, queryParams);
        res.json({ songs: result.rows });
      } catch (err) {
        res.status(500).json({ message: 'Error getting public songs' });
      }
    }
  });
});

// Ruta para subir canciones
app.post('/api/favorites/upload', verifyToken, upload.single('audio'), (req, res) => {
  jwt.verify(req.token, secretKey, async (err, authData) => {
    if (err) {
      res.sendStatus(403);
    } else {
      const { song_key, nombre, artista, album } = req.body;
      if (!req.file || !song_key || !nombre) {
        return res.status(400).json({ message: 'File and name required' });
      }

      try {
        const filePath = `${authData.id}/${song_key}.mp3`;

        // Subir el archivo
        const { error: uploadError } = await supabase.storage
          .from(process.env.SUPABASE_BUCKET)
          .upload(filePath, req.file.buffer, { contentType: 'audio/mpeg', upsert: true });

        if (uploadError) throw uploadError;

        // Enlace de la canción
        const { data: publicData } = supabase.storage.from(process.env.SUPABASE_BUCKET).getPublicUrl(filePath);

        // Guardado de datos de la canción
        const result = await db.query(
          `INSERT INTO favorite_songs (user_id, song_key, nombre, artista, album, ruta_archivo)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [authData.id, song_key, nombre, artista, album || null, publicData.publicUrl]
        );

        res.status(201).json({ message: 'Song uploaded', favorite: result.rows[0] });
      } catch (err) {
        res.status(500).json({ message: 'Error uploading song', details: err.message });
      }
    }
  });
});

// Ruta para borrar canciones
app.delete('/api/favorites/:songKey', verifyToken, (req, res) => {
  jwt.verify(req.token, secretKey, async (err, authData) => {
    if (err) {
      res.sendStatus(403);
    } else {
      try {
        const { songKey } = req.params;
        const filePath = `${authData.id}/${songKey}.mp3`;

        await supabase.storage.from(process.env.SUPABASE_BUCKET).remove([filePath]);
        await db.query('DELETE FROM favorite_songs WHERE user_id = $1 AND song_key = $2', [authData.id, songKey]);

        res.json({ message: 'Song deleted' });
      } catch (err) {
        res.status(500).json({ message: 'Error deleting song' });
      }
    }
  });
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});

module.exports = app;