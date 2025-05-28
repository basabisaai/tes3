// backend/app.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

// ✅ Konfigurasi CORS lebih spesifik
const corsOptions = {
  origin: function (origin, callback) {
    // Daftar origin yang diizinkan
    const allowedOrigins = [
      'http://localhost:5173',
      'http://192.168.0.198:5173' // IP jaringan kamu
    ];
    
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions)); // Gunakan opsi CORS yang didefinisikan
app.use(express.json());

// Routes
const aiRouter = require('./routes/ai');
const ttsRouter = require('./routes/tts');
const langDetectRouter = require('./routes/langdetect');

app.use('/api/ai', aiRouter);
app.use('/api/tts', ttsRouter);
app.use('/api', langDetectRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});