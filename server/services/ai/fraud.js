function detectFraud({ documents = [], application = {}, job = {} }) {
  let riskScore = 0;
  const flags = [];

  if (documents.length > 20) { riskScore += 20; flags.push('Too many uploaded files'); }

  const duplicateTypes = documents.map(d => d.document_type).filter(Boolean)
    .filter((type, index, arr) => arr.indexOf(type) !== index);
  if (duplicateTypes.length) { riskScore += 10; flags.push('Duplicate document types'); }

  if (!application.full_name) { riskScore += 10; flags.push('Missing full name'); }

  if (job.deadline && new Date(job.deadline).getTime() < Date.now()) {
    riskScore += 15; flags.push('Application linked to expired job');
  }

  const label = riskScore >= 75 ? 'High Fraud Risk' : riskScore >= 50 ? 'Suspicious' : riskScore >= 25 ? 'Needs Review' : 'Clean';
  return { riskScore, label, flags };
}

module.exports = { detectFraud };
