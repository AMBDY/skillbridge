const { supabase } = require('../utils/db');

const BACKUP_TABLES = [
  'profiles', 'services', 'products', 'jobs', 'job_applications', 'agreements', 'payments',
  'subscriptions', 'subscription_plans', 'reviews', 'categories', 'kyc_submissions', 'disputes',
  'ads', 'site_content', 'testimonials', 'featured_items', 'comments', 'platform_settings',
  'recruitment_jobs', 'recruitment_applications', 'recruitment_screening_results', 'blog_posts'
];

async function runBackup() {
  const bundle = { exportedAt: new Date().toISOString(), tables: {} };
  for (const table of BACKUP_TABLES) {
    const { data, error } = await supabase.from(table).select('*');
    bundle.tables[table] = error ? { error: error.message } : data;
  }
  const path = `auto/skillbridge-backup-${Date.now()}.json`;
  const { error: uploadError } = await supabase.storage.from('backups').upload(path, JSON.stringify(bundle), {
    contentType: 'application/json', upsert: false
  });
  if (uploadError) console.error('[backup-scheduler] upload failed:', uploadError.message);
  else console.log(`[backup-scheduler] backup saved: ${path}`);
}

function startBackupScheduler() {
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!hasServiceRole) {
    console.log('[backup-scheduler] SUPABASE_SERVICE_ROLE_KEY not set — automated backups disabled. Manual backup from Superadmin → Export still works.');
    return;
  }
  const intervalMs = 24 * 60 * 60 * 1000; // daily
  setInterval(() => runBackup().catch(e => console.error('[backup-scheduler] failed:', e.message)), intervalMs).unref?.();
  console.log('[backup-scheduler] automated daily backups enabled.');
}

module.exports = { startBackupScheduler, runBackup, BACKUP_TABLES };
