function generateQuestions(job) {
  const skills = job.required_skills || [];
  const base = [
    `Tell us about your experience related to ${job.title}.`,
    `Describe a project where you used ${skills[0] || 'the required skills'}.`,
    `How would you handle a deadline-sensitive task for ${job.company_name}?`
  ];
  return base.map(question => ({ question, duration_limit: 120, attempts_allowed: 1 }));
}

module.exports = { generateQuestions };
