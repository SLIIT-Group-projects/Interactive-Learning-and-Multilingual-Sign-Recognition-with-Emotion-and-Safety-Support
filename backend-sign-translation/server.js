require("dotenv").config();
const express = require('express');
const cors = require('cors');
const app = express();

const PYTHON_API = process.env.PYTHON_API_URL;
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const signRoutes = require('./routes/signRoutes');
app.use('/api', signRoutes);

app.listen(PORT, () => {
  console.log(`Backend Sign Translation running on port ${PORT}`);
});

 
