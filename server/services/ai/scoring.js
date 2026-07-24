function labelForScore(score) {
  if (score >= 95) return 'Excellent Match';
  if (score >= 80) return 'Strong Match';
  if (score >= 65) return 'Moderate Match';
  return 'Needs Review';
}

function recommendationForScore(score, riskScore) {
  if (riskScore >= 75) return 'Fraud Alert';
  if (score >= 95) return 'Hire Immediately';
  if (score >= 80) return 'Fast Track Interview';
  if (score >= 65) return 'Shortlist';
  if (score >= 45) return 'Manual Review';
  return 'Reject';
}

function weightedCandidateScore({ skills = 0, experience = 0, education = 0, certification = 0, video = 0 }) {
  const score = (skills * 0.4) + (experience * 0.25) + (education * 0.15) + (certification * 0.1) + (video * 0.1);
  return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = { labelForScore, recommendationForScore, weightedCandidateScore };
