import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:8000' }));
app.use(express.json());

// Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Logging
const log = (level, msg, data = '') => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${msg}`, data ? data : '');
};

// ==================== ROUTES ====================

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// POST /api/bookings - Create a new booking
app.post('/api/bookings', async (req, res) => {
  try {
    const { property_ref, check_in, check_out, guest_count, customer_note, user_id } = req.body;

    // Validation
    if (!property_ref || !check_in || !check_out) {
      return res.status(400).json({
        error: 'Missing required fields: property_ref, check_in, check_out',
      });
    }

    const checkInDate = new Date(check_in);
    const checkOutDate = new Date(check_out);
    if (checkOutDate <= checkInDate) {
      return res.status(400).json({
        error: 'check_out must be after check_in',
      });
    }

    if (guest_count && guest_count <= 0) {
      return res.status(400).json({
        error: 'guest_count must be positive',
      });
    }

    // For demo: use a hardcoded user_id or accept from request
    const userId = user_id || '550e8400-e29b-41d4-a716-446655440000';

    const { data, error } = await supabase
      .from('bookings')
      .insert([
        {
          user_id: userId,
          property_ref,
          check_in,
          check_out,
          guest_count: guest_count || null,
          customer_note: customer_note || null,
          status: 'pending_review',
        },
      ])
      .select();

    if (error) {
      log('ERROR', 'Failed to create booking', error.message);
      return res.status(400).json({ error: error.message });
    }

    log('INFO', 'Booking created', `ID: ${data[0].id}`);
    res.json({
      message: 'Booking created successfully',
      booking: data[0],
    });
  } catch (err) {
    log('ERROR', 'POST /api/bookings', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bookings/:id - Get booking status
app.get('/api/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (bookingError) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Get associated task
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('booking_id', id);

    const task = tasks && tasks.length > 0 ? tasks[0] : null;

    // Get task result if completed
    let taskResult = null;
    if (task) {
      const { data: result } = await supabase
        .from('task_results')
        .select('*')
        .eq('task_id', task.id)
        .single();
      taskResult = result;
    }

    res.json({
      booking,
      task,
      result: taskResult,
    });
  } catch (err) {
    log('ERROR', 'GET /api/bookings/:id', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/:id/events - Get task event history
app.get('/api/tasks/:id/events', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('task_events')
      .select('*')
      .eq('task_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ events: data });
  } catch (err) {
    log('ERROR', 'GET /api/tasks/:id/events', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/debug/tasks - List all tasks (debug only)
app.get('/api/debug/tasks', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ tasks: data });
  } catch (err) {
    log('ERROR', 'GET /api/debug/tasks', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== SERVER START ====================

app.listen(PORT, () => {
  log('INFO', `Server running on http://localhost:${PORT}`);
  log('INFO', `Frontend URL: ${process.env.FRONTEND_URL}`);
  log('INFO', `Supabase URL: ${process.env.SUPABASE_URL}`);
});
