const express = require('express');
const cors = require('cors'); // 🟢 Add this line

const app = express();
const PORT = process.env.PORT || 3000;

const aiRouter = require('./routes/ai.js');

// 🟢 Apply CORS middleware here
app.use(cors({
  origin: 'https://basabisa.vercel.app',
  credentials: true
}));

app.use(express.json()); // parse incoming JSON
app.use('/api', aiRouter); // mount your routes

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
