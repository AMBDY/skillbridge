const { supabase } = require('./db');

function substitute(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] != null ? String(vars[key]) : ''));
}

// Sends a templated email. Returns { sent: boolean, reason?: string } —
// never throws, so a failed/skipped email never blocks the action that
// triggered it (same fire-and-forget principle as notify()).
async function sendEmail(templateKey, to, vars = {}) {
  try {
    const { data: template } = await supabase.from('email_templates').select('*').eq('template_key', templateKey).maybeSingle();
    if (!template) return { sent: false, reason: `No template found for "${templateKey}"` };

    const { data: settings } = await supabase.from('platform_settings').select('site_name').limit(1).maybeSingle();
    const fullVars = { site_name: settings?.site_name || 'SkillBridge', ...vars };
    const subject = substitute(template.subject, fullVars);
    const body = substitute(template.body, fullVars);

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      console.log(`[email] Skipped "${templateKey}" to ${to} — RESEND_API_KEY/RESEND_FROM_EMAIL not configured. Would have sent: "${subject}"`);
      return { sent: false, reason: 'Email provider not configured (RESEND_API_KEY/RESEND_FROM_EMAIL)' };
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text: body })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { sent: false, reason: `Resend API error: ${errText}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

module.exports = { sendEmail };
