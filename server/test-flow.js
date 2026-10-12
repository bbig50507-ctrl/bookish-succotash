import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const log = (level, msg, data = '') => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${msg}`, data ? data : '');
};

async function testFlow() {
  try {
    log('INFO', '=== Starting Test Flow ===');

    // Step 1: Insert a booking
    log('INFO', 'Step 1: Inserting test booking...');
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert([
        {
          user_id: '550e8400-e29b-41d4-a716-446655440000',
          property_ref: 'TEST-PROPERTY-001',
          check_in: '2026-11-01',
          check_out: '2026-11-05',
          guest_count: 2,
          customer_note: 'Test booking from automated flow - please review',
          status: 'pending_review',
        },
      ])
      .select();

    if (bookingError) {
      log('ERROR', 'Failed to insert booking', bookingError.message);
      return;
    }

    const bookingId = booking[0].id;
    log('INFO', 'Booking created', `ID: ${bookingId}`);

    // Step 2: Check if task was auto-created
    log('INFO', 'Step 2: Checking if task was auto-created...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('booking_id', bookingId);

    if (!tasks || tasks.length === 0) {
      log('ERROR', 'No task found for booking');
      return;
    }

    const taskId = tasks[0].id;
    log('INFO', 'Task auto-created', `ID: ${taskId}, Status: ${tasks[0].status}`);

    // Step 3: Check events
    log('INFO', 'Step 3: Checking task events...');
    const { data: events } = await supabase
      .from('task_events')
      .select('*')
      .eq('task_id', taskId);

    log('INFO', `Found ${events?.length || 0} events for task`);
    events?.forEach((event, i) => {
      log('INFO', `  Event ${i + 1}:`, `${event.old_status} → ${event.new_status}`);
    });

    // Step 4: Wait for Claude review (max 30 seconds)
    log('INFO', 'Step 4: Waiting for Claude review (max 30s)...');
    let reviewed = false;
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const { data: taskStatus } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      log('INFO', `  Poll ${i + 1}: Status = ${taskStatus.status}`);

      if (taskStatus.status === 'succeeded' || taskStatus.status === 'failed') {
        reviewed = true;
        break;
      }
    }

    if (!reviewed) {
      log('WARN', 'Claude review not completed within 30s (normal if GitHub Action is still running)');
    }

    // Step 5: Get final result
    log('INFO', 'Step 5: Fetching final result...');
    const { data: result } = await supabase
      .from('task_results')
      .select('*')
      .eq('task_id', taskId)
      .single();

    if (result) {
      log('INFO', 'Claude Review Result:');
      console.log(JSON.stringify(result.result, null, 2));
    } else {
      log('INFO', 'No result yet (check GitHub Actions workflow)');
    }

    log('INFO', '=== Test Flow Complete ===');
    log('INFO', `Booking ID: ${bookingId}`);
    log('INFO', `Task ID: ${taskId}`);

  } catch (err) {
    log('ERROR', 'Test flow error', err.message);
  }
}

testFlow();
