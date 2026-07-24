// Fire-and-forget notification. Never throws — a failed notification should
// never block the actual action (payment release, KYC approval, etc.).
async function notify(client, { userId, type, title, body, link }) {
  if (!userId) return;
  try {
    await client.rpc('create_notification', { p_user_id: userId, p_type: type, p_title: title, p_body: body || null, p_link: link || null });
  } catch { /* notifications are best-effort */ }
}

module.exports = { notify };
