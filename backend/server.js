const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const aiRouter = require('./routes/ai.js');

app.use(express.json()); // middleware to parse JSON
app.use('/api', aiRouter); // all routes start with /api

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
