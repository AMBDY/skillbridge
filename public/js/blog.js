document.addEventListener('DOMContentLoaded', async () => {
  const posts = await API.get('/marketplace/blog').catch(() => []);
  document.getElementById('blogGrid').innerHTML = posts.length ? posts.map(p => `
    <a href="/blog-post.html?slug=${p.slug}" class="card">
      <div class="card-img">${p.cover_image ? `<img src="${p.cover_image}" alt="${p.title}">` : ''}</div>
      <div class="card-body">
        <div class="card-title">${p.title}</div>
        <p style="color:var(--text-muted);font-size:0.9rem;margin-top:6px">${p.excerpt || ''}</p>
        <div class="card-meta" style="margin-top:8px">${p.published_at ? new Date(p.published_at).toLocaleDateString() : ''}</div>
      </div>
    </a>`).join('') : '<p style="color:var(--text-muted)">No posts yet — check back soon.</p>';
});
