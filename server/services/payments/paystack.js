const crypto = require('crypto');

function secret() { return process.env.PAYSTACK_SECRET_KEY || ''; }
function signatureIsValid(rawBody, signature) {
  if (!secret() || !signature || !rawBody) return false;
  const digest = crypto.createHmac('sha512', secret()).update(rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(String(signature), 'hex')); }
  catch { return false; }
}
async function initialize({ email, amount, reference, callbackUrl, metadata }) {
  if (!secret()) throw new Error('PAYSTACK_SECRET_KEY is not configured on the server.');
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST', headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, amount: Math.round(Number(amount) * 100), reference, callback_url: callbackUrl, metadata })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.status) throw new Error(body.message || 'Paystack could not initialize the transaction.');
  return body.data;
}
async function verify(reference) {
  if (!secret()) throw new Error('PAYSTACK_SECRET_KEY is not configured on the server.');
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret()}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.status) throw new Error(body.message || 'Paystack verification failed.');
  return body.data;
}
module.exports = { signatureIsValid, initialize, verify };
