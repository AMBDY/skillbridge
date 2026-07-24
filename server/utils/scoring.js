// Free, rule-based application scoring — no external AI API required.
// This mirrors the "Level 1 – Basic AI (Free)" tier from the recruitment
// spec: keyword overlap, rating, completion rate, verification, location,
// and budget fit, combined into a 0-100 score with human-readable reasons.

function keywordOverlapScore(jobText, candidateText) {
  const stop = new Set(['the','and','for','with','you','are','that','this','have','will','from','your','has','was','were','can','our','not','all','any']);
  const words = (s) => (s || '').toLowerCase().match(/[a-z]{3,}/g)?.filter(w => !stop.has(w)) || [];
  const jobWords = new Set(words(jobText));
  const candWords = new Set(words(candidateText));
  if (!jobWords.size) return 0.5;
  let hits = 0;
  jobWords.forEach(w => { if (candWords.has(w)) hits++; });
  return Math.min(hits / Math.max(jobWords.size * 0.3, 1), 1);
}

function scoreJobApplication(job, applicant, application) {
  const reasons = [];

  const skillScore = keywordOverlapScore(
    `${job.title || ''} ${job.description || ''}`,
    `${application.cover_letter || ''} ${applicant?.about || ''} ${applicant?.cover_letter || ''}`
  );
  if (skillScore >= 0.5) reasons.push('Matching skills/keywords with the job description');

  const ratingScore = (applicant?.rating || 0) / 5;
  if (ratingScore >= 0.8) reasons.push('High rating');

  const completionScore = (applicant?.completion_rate ?? 100) / 100;
  if (completionScore >= 0.9) reasons.push('Strong completion rate');

  const kycScore = (applicant?.kyc_level || 0) / 4;
  if (kycScore >= 0.75) reasons.push('Verified / KYC confirmed');

  const locationScore = job.state && applicant?.state && job.state.toLowerCase() === applicant.state.toLowerCase() ? 1 : 0.4;
  if (locationScore === 1) reasons.push('Same location as the job');

  const responseScore = 1 - Math.min((applicant?.response_time_hours ?? 24) / 48, 1);
  if (responseScore >= 0.75) reasons.push('Fast response time');

  let budgetScore = 0.6;
  const price = Number(application.expected_price);
  if (Number.isFinite(price)) {
    const min = job.price_min ? Number(job.price_min) : null;
    const max = job.price_max ? Number(job.price_max) : (job.budget ? Number(job.budget) : null);
    if (min != null && max != null) {
      budgetScore = (price >= min && price <= max) ? 1 : 0.3;
      if (budgetScore === 1) reasons.push('Expected price within budget range');
    } else if (max != null) {
      budgetScore = price <= max ? 1 : 0.4;
      if (budgetScore === 1) reasons.push('Expected price within budget');
    }
  }

  const weighted =
    skillScore * 0.30 +
    ratingScore * 0.20 +
    completionScore * 0.15 +
    kycScore * 0.15 +
    locationScore * 0.08 +
    responseScore * 0.07 +
    budgetScore * 0.05;

  const score = Math.round(weighted * 100 * 100) / 100;
  return { score, reasons };
}

module.exports = { scoreJobApplication, keywordOverlapScore };
