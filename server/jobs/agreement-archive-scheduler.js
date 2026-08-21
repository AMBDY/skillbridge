const { supabase } = require('../utils/db');
const { agreementPdf, zip } = require('../utils/document-export');

function safeName(value) { return String(value || 'Agreement').replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80); }
async function archiveMonth(month) {
  const start = new Date(`${month}-01T00:00:00Z`), end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const { data: agreements, error } = await supabase.from('agreements').select('*').eq('status', 'completed').gte('completion_at', start.toISOString()).lt('completion_at', end.toISOString());
  if (error) throw error;
  const files = [];
  for (const agreement of agreements || []) {
    const [{ data: parties }, { data: auditLog }] = await Promise.all([supabase.from('agreement_parties').select('*').eq('agreement_id', agreement.id), supabase.from('agreement_audit_log').select('*').eq('agreement_id', agreement.id).order('created_at')]);
    files.push({ name: `${safeName(agreement.completed_filename || agreement.agreement_number)}.pdf`, data: agreementPdf(agreement, parties || [], auditLog || []) });
  }
  const filename = `agreements/${month}/AGREEMENTS-${month}.zip`;
  const { error: storageError } = await supabase.storage.from('agreement_archives').upload(filename, zip(files), { contentType: 'application/zip', upsert: true });
  if (storageError) throw storageError;
  const { error: archiveError } = await supabase.from('agreement_archives').upsert({ archive_month: `${month}-01`, agreement_count: files.length, archive_url: filename }, { onConflict: 'archive_month' });
  if (archiveError) throw archiveError;
  return { month, agreementCount: files.length, archiveUrl: filename };
}
async function runAgreementArchiveScheduler() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const date = new Date(); date.setUTCMonth(date.getUTCMonth() - 1); const month = date.toISOString().slice(0, 7);
  try { const result = await archiveMonth(month); console.log(`[agreement-archive] archived ${result.agreementCount} agreements for ${month}`); } catch (e) { console.error('[agreement-archive] failed:', e.message); }
}
function startAgreementArchiveScheduler() { if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return; setTimeout(() => runAgreementArchiveScheduler(), 15000).unref?.(); setInterval(runAgreementArchiveScheduler, 24 * 60 * 60 * 1000).unref?.(); }
module.exports = { startAgreementArchiveScheduler, runAgreementArchiveScheduler, archiveMonth };
