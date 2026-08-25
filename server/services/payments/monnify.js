const crypto = require('crypto');
const base = () => process.env.MONNIFY_BASE_URL || 'https://api.monnify.com';
async function token() {
  const apiKey = process.env.MONNIFY_API_KEY, secret = process.env.MONNIFY_SECRET_KEY;
  if (!apiKey || !secret) throw new Error('MONNIFY_API_KEY and MONNIFY_SECRET_KEY are not configured on the server.');
  const response = await fetch(`${base()}/api/v1/auth/login`, { headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${secret}`).toString('base64')}` } });
  const body = await response.json().catch(() => ({})); const value = body.responseBody?.accessToken;
  if (!response.ok || !value) throw new Error(body.responseMessage || 'Monnify authentication failed.'); return value;
}
function signatureIsValid(raw, signature) {
  const secret = process.env.MONNIFY_SECRET_KEY || ''; if (!secret || !raw || !signature) return false;
  const digest = crypto.createHmac('sha512', secret).update(raw).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(String(signature), 'hex')); } catch { return false; }
}
async function verify(reference) { const accessToken = await token(); const response = await fetch(`${base()}/api/v2/merchant/transactions/query?paymentReference=${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${accessToken}` } }); const body = await response.json().catch(() => ({})); if (!response.ok || !body.requestSuccessful) throw new Error(body.responseMessage || 'Monnify verification failed.'); return body.responseBody; }
async function initialize({ amount, reference, email, name, redirectUrl, metadata }) { const contractCode = process.env.MONNIFY_CONTRACT_CODE; if (!contractCode) throw new Error('MONNIFY_CONTRACT_CODE is not configured on the server.'); const accessToken = await token(); const response = await fetch(`${base()}/api/v1/merchant/transactions/init-transaction`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Number(amount), customerName: name || email, customerEmail: email, paymentReference: reference, paymentDescription: `SkillBridge ${reference}`, currencyCode: 'NGN', contractCode, redirectUrl, metaData: metadata || {} }) }); const body = await response.json().catch(() => ({})); if (!response.ok || !body.requestSuccessful) throw new Error(body.responseMessage || 'Monnify payment initialization failed.'); return body.responseBody; }
module.exports = { signatureIsValid, verify, initialize };
