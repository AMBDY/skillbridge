// Jobs page logic
const JobsPage = (function () {
  const CAT_ICONS = { 'remote-jobs': '🌐', 'office-jobs': '🏢', 'contract-jobs': '📄', 'hybrid-jobs': '🔀', 'internship': '🎓' };

  async function init() {
    const cats = await API.get('/marketplace/categories?ecosystem=jobs').catch(() => []);
    document.getElementById('catGrid').innerHTML = cats.map(c => `
      <a href="/category.html?ecosystem=jobs&slug=${c.slug}" class="cat-tile">
        <span class="cat-icon">${CAT_ICONS[c.slug] || '💼'}</span>
        <span class="cat-name">${c.name}</span>
      </a>`).join('');

    const list = document.getElementById('jobList');
    list.innerHTML = '<div class="skeleton" style="height:120px;margin-bottom:12px"></div><div class="skeleton" style="height:120px"></div>';
    const jobs = await API.get('/jobs').catch(() => []);
    if (!jobs.length) {
      list.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted)">No jobs posted yet. <a href="/post-job.html" style="color:var(--gold)">Post the first job</a></div>`;
      return;
    }
    list.innerHTML = jobs.map(j => `
      <div class="card" style="margin-bottom:12px">
        <div class="card-body" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px">
          <div>
            <div class="card-title" style="font-size:1.2rem"><a href="/job.html?id=${j.id}">${j.title}</a></div>
            <div class="card-meta">
              <span>${j.categories?.name || 'General'}</span>
              <span>•</span><span>${j.location || j.state || 'Nigeria'}</span>
              <span>•</span><span>${j.duration || 'Flexible'}</span>
              ${j.profiles?.kyc_level >= 3 ? '<span class="badge badge-verified">✓ Verified client</span>' : ''}
            </div>
          </div>
          <div style="text-align:right">
            <div class="card-price">${fmtPrice(j.budget || j.price_max || 0)}</div>
            <a href="/job.html?id=${j.id}" class="btn btn-gold btn-sm" style="margin-top:8px">View & Bid</a>
          </div>
        </div>
      </div>`).join('');
  }
  return { init };
})();
