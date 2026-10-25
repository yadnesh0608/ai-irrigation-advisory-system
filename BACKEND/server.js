const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { name, phone, password, village } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO farmers (name, phone, password, village) VALUES ($1, $2, $3, $4) RETURNING id, name, phone',
      [name, phone, hashed, village]
    );
    res.json({ message: 'Registered successfully', farmer: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const result = await pool.query('SELECT * FROM farmers WHERE phone = $1', [phone]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'User not found' });

    const farmer = result.rows[0];
    const valid = await bcrypt.compare(password, farmer.password);
    if (!valid) return res.status(400).json({ error: 'Wrong password' });

    const token = jwt.sign({ id: farmer.id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, farmer: { id: farmer.id, name: farmer.name, phone: farmer.phone } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Middleware to check tokenOP45
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.farmerId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Get farmer dashboard data
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const plots = await pool.query('SELECT * FROM plots WHERE farmer_id = $1', [req.farmerId]);
    const readings = await pool.query(`
      SELECT sr.*, p.plot_name 
      FROM sensor_readings sr 
      JOIN plots p ON sr.plot_id = p.id 
      WHERE p.farmer_id = $1 
      ORDER BY sr.recorded_at DESC LIMIT 5
    `, [req.farmerId]);
    const recs = await pool.query(`
      SELECT ir.*, p.plot_name 
      FROM irrigation_recommendations ir 
      JOIN plots p ON ir.plot_id = p.id 
      WHERE p.farmer_id = $1 
      ORDER BY ir.created_at DESC LIMIT 5
    `, [req.farmerId]);

    res.json({
      plots: plots.rows,
      recentReadings: readings.rows,
      recommendations: recs.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a plot
app.post('/api/plots', auth, async (req, res) => {
  try {
    const { plot_name, area_acres, soil_type } = req.body;
    const result = await pool.query(
      'INSERT INTO plots (farmer_id, plot_name, area_acres, soil_type) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.farmerId, plot_name, area_acres, soil_type]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add sensor reading + generate simple recommendation
app.post('/api/sensor', auth, async (req, res) => {
  try {
    const { plot_id, soil_moisture, temperature } = req.body;

    await pool.query(
      'INSERT INTO sensor_readings (plot_id, soil_moisture, temperature) VALUES ($1, $2, $3)',
      [plot_id, soil_moisture, temperature]
    );

    // Simple "AI" rule-based recommendation
    let recommendation = '';
    let duration = 0;
    let nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);

    if (soil_moisture < 30) {
      recommendation = 'Soil is dry. Irrigate tomorrow morning for 3 hours.';
      duration = 3;
    } else if (soil_moisture < 50) {
      recommendation = 'Moderate moisture. Irrigate in 2 days for 2 hours.';
      duration = 2;
      nextDate.setDate(nextDate.getDate() + 1);
    } else {
      recommendation = 'Soil moisture is good. No irrigation needed today.';
      duration = 0;
    }

    const recResult = await pool.query(
      `INSERT INTO irrigation_recommendations 
       (plot_id, recommendation, next_irrigation_date, duration_hours) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [plot_id, recommendation, nextDate, duration]
    );

    res.json({ message: 'Reading added', recommendation: recResult.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});