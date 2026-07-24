document.addEventListener('DOMContentLoaded', async () => {
  const slug = new URLSearchParams(location.search).get('slug');
  const main = document.getElementById('postMain');
  if (!slug) { main.innerHTML = '<p>No post specified.</p>'; return; }

  const post = await API.get(`/marketplace/blog/${slug}`).catch(() => null);
  if (!post) { main.innerHTML = '<p>Post not found.</p>'; return; }

  document.title = `${post.title} — SkillBridge Blog`;
  main.innerHTML = `
    <span class="eyebrow">Blog</span>
    <h1 class="section-title">${post.title}</h1>
    <p class="section-sub">${post.published_at ? new Date(post.published_at).toLocaleDateString() : ''}</p>
    ${post.cover_image ? `<img src="${post.cover_image}" alt="${post.title}" style="width:100%;border-radius:var(--radius-lg);margin:20px 0">` : ''}
    <div style="color:var(--text-soft);line-height:1.8;white-space:pre-wrap">${post.body}</div>`;

  const recent = await API.get('/marketplace/blog').catch(() => []);
  document.getElementById('recentPosts').innerHTML = recent.filter(p => p.slug !== slug).slice(0, 5).map(p => `
    <a href="/blog-post.html?slug=${p.slug}" style="display:block;margin-bottom:12px;color:inherit;text-decoration:none">
      <div style="font-weight:500;font-size:0.95rem">${p.title}</div>
      <div style="font-size:0.8rem;color:var(--text-muted)">${p.published_at ? new Date(p.published_at).toLocaleDateString() : ''}</div>
    </a>`).join('') || '<p style="color:var(--text-muted);font-size:0.9rem">No other posts yet.</p>';
});
