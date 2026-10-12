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

async function monitor() {
  log('INFO', '=== System Monitor ===');
  log('INFO', 'Fetching dashboard data...');

  try {
    // Count bookings by status
    const { data: bookings } = await supabase
      .from('bookings')
      .select('status')
      .order('created_at', { ascending: false });

    const bookingStats = {
      total: bookings?.length || 0,
      pending_review: bookings?.filter(b => b.status === 'pending_review').length || 0,
      confirmed: bookings?.filter(b => b.status === 'confirmed').length || 0,
      cancelled: bookings?.filter(b => b.status === 'cancelled').length || 0,
    };

    log('INFO', '📊 Bookings:');
    console.table(bookingStats);

    // Count tasks by status
    const { data: tasks } = await supabase
      .from('tasks')
      .select('status')
      .order('created_at', { ascending: false });

    const taskStats = {
      total: tasks?.length || 0,
      queued: tasks?.filter(t => t.status === 'queued').length || 0,
      processing: tasks?.filter(t => t.status === 'processing').length || 0,
      succeeded: tasks?.filter(t => t.status === 'succeeded').length || 0,
      failed: tasks?.filter(t => t.status === 'failed').length || 0,
    };

    log('INFO', '⚙️ Tasks:');
    console.table(taskStats);

    // Recent events
    const { data: events } = await supabase
      .from('task_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    log('INFO', '📝 Recent Events (last 10):');
    events?.forEach((event, i) => {
      console.log(
        `  ${i + 1}. ${event.old_status || 'start'} → ${event.new_status} (${new Date(event.created_at).toLocaleTimeString()})`
      );
    });

    // Failed tasks
    const { data: failedTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(5);

    if (failedTasks && failedTasks.length > 0) {
      log('WARN', '❌ Failed Tasks:');
      failedTasks.forEach((task, i) => {
        console.log(`  ${i + 1}. ${task.id}: ${task.last_error}`);
      });
    }

    log('INFO', '=== End of Report ===');
  } catch (err) {
    log('ERROR', 'Monitor error', err.message);
  }
}

monitor();
