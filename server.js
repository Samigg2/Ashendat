const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Set these in your Render environment variables!
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper: Admin auth
function checkAdminAuth(req, res) {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// --- Nominee Endpoints ---

// Get all nominees
app.get('/nominees', async (req, res) => {
  const { data, error } = await supabase.from('nominees').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Admin: Get all nominees
app.get('/admin/nominees', async (req, res) => {
  if (!checkAdminAuth(req, res)) return;
  const { data, error } = await supabase.from('nominees').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Admin: Add nominee
app.post('/admin/nominees', async (req, res) => {
  if (!checkAdminAuth(req, res)) return;
  const { name, place, age, facebook } = req.body;
  if (!name || !place || !age || !facebook) return res.status(400).json({ error: 'All fields required' });
  const { data, error } = await supabase.from('nominees').insert([{ name, place, age, facebook }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, nominee: data[0] });
});

// Admin: Edit nominee
app.put('/admin/nominees/:id', async (req, res) => {
  if (!checkAdminAuth(req, res)) return;
  const { id } = req.params;
  const { name, place, age, facebook } = req.body;
  const { data, error } = await supabase.from('nominees').update({ name, place, age, facebook }).eq('id', id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, nominee: data[0] });
});

// Admin: Delete nominee
app.delete('/admin/nominees/:id', async (req, res) => {
  if (!checkAdminAuth(req, res)) return;
  const { id } = req.params;
  const { error } = await supabase.from('nominees').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// --- Deadline Endpoints ---

// Get deadline
app.get('/deadline', async (req, res) => {
  const { data, error } = await supabase.from('config').select('*').eq('key', 'deadline').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deadline: data ? data.value : null });
});

// Admin: Set deadline
app.post('/admin/deadline', async (req, res) => {
  if (!checkAdminAuth(req, res)) return;
  const { deadline } = req.body;
  if (!deadline) return res.status(400).json({ error: 'Deadline required' });
  // Upsert deadline
  const { error } = await supabase.from('config').upsert([{ key: 'deadline', value: deadline }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// --- Voting Endpoints ---

// Vote (one IP per nominee)
app.post('/vote', async (req, res) => {
  const { nominee_id } = req.body;
  if (!nominee_id) return res.status(400).json({ error: 'nominee_id required' });
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  // Check if this IP already voted for this nominee
  const { data: existing, error: err1 } = await supabase
    .from('votes')
    .select('*')
    .eq('nominee_id', nominee_id)
    .eq('ip_address', ip);
  if (err1) return res.status(500).json({ error: err1.message });
  if (existing.length > 0) return res.status(403).json({ error: 'Already voted for this nominee from this IP' });
  // Register vote
  const { error } = await supabase.from('votes').insert([{ nominee_id, ip_address: ip }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// --- Analytics ---

// Get votes per nominee
app.get('/admin/analytics', async (req, res) => {
  if (!checkAdminAuth(req, res)) return;
  const { data: nominees, error: err1 } = await supabase.from('nominees').select('*');
  if (err1) return res.status(500).json({ error: err1.message });
  const { data: votes, error: err2 } = await supabase.from('votes').select('*');
  if (err2) return res.status(500).json({ error: err2.message });
  // Count votes per nominee
  const counts = {};
  votes.forEach(v => {
    counts[v.nominee_id] = (counts[v.nominee_id] || 0) + 1;
  });
  const analytics = nominees.map(n => ({
    ...n,
    votes: counts[n.id] || 0
  }));
  analytics.sort((a, b) => b.votes - a.votes);
  res.json(analytics);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));