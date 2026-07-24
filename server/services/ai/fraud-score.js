function deterministicRiskScore(payload) {
  let score = 0;
  const amount = Number(payload.amount || payload.data?.amount || 0);
  if (amount >= 1000000) score += 35;
  else if (amount >= 500000) score += 20;
  else if (amount >= 100000) score += 10;

  const reason = String(payload.reason || payload.data?.reason || '').toLowerCase();
  if (reason.includes('scam')) score += 20;
  if (reason.includes('fake')) score += 15;
  if (reason.includes('urgent')) score += 10;

  if (payload.user_kyc_level !== undefined && Number(payload.user_kyc_level) < 2) score += 20;

  const risk = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  return { risk, score, flags: [] };
}

module.exports = { deterministicRiskScore };
