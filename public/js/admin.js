document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { location.href = '/signin.html'; return; }
  const user = Auth.user();
  if (user.role !== 'admin') {
    document.getElementById('adminMain').innerHTML = '<p>Admin access required. Contact the platform owner.</p>';
    return;
  }

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'kyc', label: 'KYC Review' },
    { id: 'jobs', label: 'Job Moderation' },
    { id: 'listings', label: 'Listings Moderation' },
    { id: 'messages', label: 'Messages' },
    { id: 'recruitment', label: 'Recruitment Jobs' },
    { id: 'disputes', label: 'Disputes' },
    { id: 'payments', label: 'Payments' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'audit', label: 'Audit Logs' },
    { id: 'subs', label: 'Subscriptions' },
    { id: 'ai', label: 'AI Ranking Control' },
    { id: 'ads', label: 'Content & Ads' },
    { id: 'adsense', label: 'Google AdSense' },
    { id: 'blog', label: 'Blog / News' },
    { id: 'content', label: 'Site Content' },
    { id: 'homepage', label: 'Homepage Builder' },
    { id: 'builder', label: 'Site Builder & Roles' },
    { id: 'agreements', label: 'Agreement Management' },
    { id: 'apikeys', label: 'API Keys' },
    { id: 'emails', label: 'Email Templates' },
    { id: 'testimonials', label: 'Testimonials' },
    { id: 'featured', label: 'Featured Items' },
    { id: 'comments', label: 'Comments' },
    { id: 'support', label: 'Support Tickets' },
    { id: 'export', label: 'Google Sheets Export' },
    { id: 'fraud', label: 'Fraud Monitoring' },
    { id: 'settings', label: 'Settings' },
  ];
  const nav = document.getElementById('adminNav');
  nav.innerHTML = sections.map(s => `<a href="#" data-sec="${s.id}" class="${s.id === 'overview' ? 'active' : ''}">${s.label}</a>`).join('');
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    nav.querySelectorAll('a').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
    load(a.dataset.sec);
  }));

  async function load(sec) {
    const main = document.getElementById('adminMain');
    main.innerHTML = '<div class="skeleton" style="height:200px"></div>';
    try {
      if (sec === 'overview') return await loadOverview();
      if (sec === 'users') return await loadUsers();
      if (sec === 'kyc') return await loadKyc();
      if (sec === 'jobs') return await loadJobs();
      if (sec === 'listings') return await loadListings();
      if (sec === 'messages') return await loadMessages();
      if (sec === 'recruitment') return await loadRecruitmentJobs();
      if (sec === 'disputes') return await loadDisputes();
      if (sec === 'payments') return await loadPayments();
      if (sec === 'revenue') return await loadRevenue();
      if (sec === 'audit') return await loadAudit();
      if (sec === 'subs') return await loadSubs();
      if (sec === 'ai') return await loadAI();
      if (sec === 'ads') return await loadAds();
      if (sec === 'adsense') return await loadAdsense();
      if (sec === 'blog') return await loadBlog();
      if (sec === 'content') return await loadSiteContent();
      if (sec === 'homepage') return await loadHomepageBuilder();
      if (sec === 'builder') return await loadBuilder();
      if (sec === 'agreements') return await loadAgreements();
      if (sec === 'apikeys') return await loadApiKeys();
      if (sec === 'emails') return await loadEmailTemplates();
      if (sec === 'testimonials') return await loadTestimonials();
      if (sec === 'featured') return await loadFeatured();
      if (sec === 'comments') return await loadComments();
      if (sec === 'support') return await loadSupportTickets();
      if (sec === 'export') return await loadExport();
      if (sec === 'fraud') return await loadFraud();
      if (sec === 'settings') return await loadSettings();
    } catch (e) { main.innerHTML = `<p>Error: ${e.message}</p>`; }
  }

  async function loadOverview() {
    const s = await API.get('/admin/overview');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Overview</h1>
      <div class="grid grid-4" style="margin:24px 0">
        <div class="stat-card"><div class="stat-num">${s.users}</div><div class="stat-label">Users</div></div>
        <div class="stat-card"><div class="stat-num">${s.jobs}</div><div class="stat-label">Jobs</div></div>
        <div class="stat-card"><div class="stat-num">${fmtPrice(s.revenue)}</div><div class="stat-label">Revenue (fees)</div></div>
        <div class="stat-card"><div class="stat-num">${s.disputes}</div><div class="stat-label">Disputes</div></div>
        <div class="stat-card"><div class="stat-num">${s.kycPending}</div><div class="stat-label">KYC Pending</div></div>
        <div class="stat-card"><div class="stat-num">${s.subsPending}</div><div class="stat-label">Subs Pending</div></div>
      </div>`;
  }

  async function loadUsers() {
    const [users, roles] = await Promise.all([API.get('/admin/users'), API.get('/admin/builder/roles')]);
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Users</h1>
      <table class="table" style="margin-top:24px"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>KYC</th><th>Tier</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${users.map(u => `<tr>
        <td>${u.display_name}</td><td>${u.email || ''}</td><td>${u.role}</td><td>L${u.kyc_level}</td><td>${u.subscription_tier}</td>
        <td><span class="badge ${u.account_status === 'active' ? 'badge-verified' : ''}" style="${u.account_status !== 'active' ? 'background:#fee2e2;color:#b91c1c' : ''}">${u.account_status || 'active'}</span></td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">
          <select class="form-select" style="width:auto;padding:5px" onchange="assignUserRole('${u.user_id}',this.value)"><option value="">Change role…</option>${roles.map(r => `<option value="${r.role_key}">${r.name}</option>`).join('')}</select>
          ${u.account_status !== 'suspended' ? `<button class="btn btn-outline btn-sm" onclick="setAccountStatus('${u.user_id}','suspended')">Suspend</button>` : ''}
          ${u.account_status !== 'banned' ? `<button class="btn btn-outline btn-sm" onclick="setAccountStatus('${u.user_id}','banned')">Ban</button>` : ''}
          ${u.account_status !== 'active' ? `<button class="btn btn-gold btn-sm" onclick="setAccountStatus('${u.user_id}','active')">Restore</button>` : ''}
        </td>
      </tr>`).join('')}
      </tbody></table>`;
  }
  window.assignUserRole = async (id, role) => { if (!role) return; try { await API.put(`/admin/users/${id}`, { role }); Toast.show('User role updated'); load('users'); } catch(e) { Toast.show(e.message); } };
  window.setAccountStatus = async (id, account_status) => {
    if (account_status === 'active') {
      try { await API.put(`/admin/users/${id}`, { account_status }); Toast.show('Account restored'); load('users'); }
      catch (e) { Toast.show(e.message); }
      return;
    }
    promptReason(account_status === 'suspended' ? 'Suspend Account' : 'Ban Account', async (reason) => {
      try { await API.put(`/admin/users/${id}`, { account_status, reason }); Toast.show(`Account ${account_status}`); load('users'); }
      catch (e) { Toast.show(e.message); }
    });
  };

  async function loadKyc() {
    const items = await API.get('/admin/kyc');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">KYC Review</h1>
      ${items.length ? items.map(k => `
        <div class="card" style="margin-top:16px"><div class="card-body">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
            <div><strong>${k.user?.display_name}</strong> (${k.user?.email})<br><span style="font-size:0.85rem;color:var(--text-muted)">${k.full_name} • ${timeAgo(k.created_at)}</span></div>
            <div><img src="${k.selfie_url}" style="max-width:200px;border-radius:8px"></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn btn-gold btn-sm" onclick="reviewKyc('${k.id}','approved')">Approve</button>
            <button class="btn btn-outline btn-sm" onclick="reviewKyc('${k.id}','rejected')">Reject</button>
          </div>
        </div></div>`).join('') : '<p style="color:var(--text-muted);margin-top:24px">No pending KYC submissions.</p>'}`;
  }
  window.reviewKyc = async (id, status) => {
    if (status === 'rejected') {
      return promptReason('Reject KYC', async (reason) => {
        await API.put(`/admin/kyc/${id}`, { status, reviewer_note: reason });
        Toast.show('KYC ' + status);
        load('kyc');
      });
    }
    await API.put(`/admin/kyc/${id}`, { status });
    Toast.show('KYC ' + status);
    load('kyc');
  };

  async function loadJobs() {
    const jobs = await API.get('/admin/jobs');
    const activeJobs = jobs.filter(j => j.status !== 'deleted_by_owner');
    const deletedJobs = jobs.filter(j => j.status === 'deleted_by_owner');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Job Moderation</h1>
      <p class="section-sub">Rejected jobs are removed after their rejection notice is sent. Jobs deleted by their poster remain below for administrator review or permanent removal.</p>
      <table class="table" style="margin-top:24px"><thead><tr><th>Title</th><th>Client</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${activeJobs.map(j => `<tr><td>${j.title}</td><td>${j.profiles?.display_name || ''}</td><td><span class="badge badge-kyc">${j.status}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="viewJobDetail('${j.id}')">View</button>
          <button class="btn btn-gold btn-sm" onclick="setJobStatus('${j.id}','approved')">Approve</button>
          <button class="btn btn-outline btn-sm" onclick="editJobAdmin('${j.id}')">Edit</button>
          <button class="btn btn-outline btn-sm" onclick="rejectJob('${j.id}')">Reject</button>
        </td></tr>`).join('')}
      </tbody></table>
      <h3 style="margin-top:28px">Deleted by Poster (${deletedJobs.length})</h3>
      ${deletedJobs.length ? `<table class="table"><thead><tr><th>Title</th><th>Poster</th><th>Actions</th></tr></thead><tbody>${deletedJobs.map(j => `<tr><td>${j.title}</td><td>${j.profiles?.display_name || ''}</td><td><button class="btn btn-outline btn-sm" onclick="viewJobDetail('${j.id}')">View</button><button class="btn btn-outline btn-sm" onclick="editJobAdmin('${j.id}')">Edit / Repost</button><button class="btn btn-outline btn-sm" onclick="purgeJob('${j.id}')">Delete permanently</button></td></tr>`).join('')}</tbody></table>` : '<p style="color:var(--text-muted)">No poster-deleted jobs.</p>'}
      <div id="jobDetailBox" style="margin-top:20px"></div>`;
    window.__jobsCache = jobs;
  }
  window.viewJobDetail = (id) => {
    const j = (window.__jobsCache || []).find(x => x.id === id);
    if (!j) return;
    document.getElementById('jobDetailBox').innerHTML = `
      <div class="card"><div class="card-body">
        <h3>${j.title}</h3>
        <p style="color:var(--text-muted);font-size:0.85rem">Posted by ${j.profiles?.display_name || 'unknown'} • ${timeAgo(j.created_at)}</p>
        <p style="margin-top:10px;color:var(--text-soft)">${j.description || 'No description provided.'}</p>
        <div class="card-meta" style="margin-top:10px">
          <span>Budget: ${fmtPrice(j.budget || 0)}</span><span>•</span><span>${j.location || j.state || 'Not stated'}</span><span>•</span><span>${j.duration || 'Not stated'}</span>
        </div>
        ${j.reference_images?.length ? `<div style="display:flex;gap:8px;margin-top:10px">${j.reference_images.map(img => `<img src="${img}" style="width:80px;height:80px;object-fit:cover;border-radius:8px">`).join('')}</div>` : ''}
      </div></div>`;
  };
  window.setJobStatus = async (id, status) => { await API.put(`/admin/jobs/${id}/status`, { status }); Toast.show('Job ' + status); load('jobs'); };
  window.editJobAdmin = async id => {
    const j = (window.__jobsCache || []).find(x => x.id === id); if (!j) return;
    const title = prompt('Job title', j.title); if (title === null) return;
    const description = prompt('Job description', j.description || ''); if (description === null) return;
    try { await API.put(`/admin/jobs/${id}`, { title, description }); Toast.show('Job updated'); load('jobs'); } catch (e) { Toast.show(e.message); }
  };
  window.purgeJob = async id => { if (!confirm('Permanently delete this archived job and its stored images?')) return; try { await API.del(`/admin/jobs/${id}`); Toast.show('Job permanently deleted'); load('jobs'); } catch (e) { Toast.show(e.message); } };
  window.rejectJob = (id) => {
    promptReason('Reject Job', async (reason) => {
      await API.put(`/admin/jobs/${id}/status`, { status: 'cancelled', reason });
      Toast.show('Job rejected');
      load('jobs');
    });
  };

  async function loadListings() {
    const [{ products, services }, all] = await Promise.all([
      API.get('/admin/listings/pending'),
      API.get('/admin/listings/all')
    ]);
    const pending = [...products.map(p => ({ ...p, type: 'products' })), ...services.map(s => ({ ...s, type: 'services' }))];
    const active = [...all.products.map(p => ({ ...p, type: 'products' })), ...all.services.map(s => ({ ...s, type: 'services' }))].filter(l => l.status === 'active');

    function listingCard(l, actionsHtml) {
      return `<div class="card" style="margin-top:12px"><div class="card-body">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <strong>${l.title}</strong> <span class="badge badge-kyc">${l.type === 'products' ? 'Product' : 'Service'}</span>
            <div class="card-meta">${fmtPrice(l.price || 0)} • ${timeAgo(l.created_at)}</div>
            <p style="margin-top:6px;color:var(--text-soft);font-size:0.9rem">${l.description || ''}</p>
            ${l.images?.length ? `<div style="display:flex;gap:6px;margin-top:8px">${l.images.slice(0, 4).map(img => `<img src="${img}" style="width:60px;height:60px;object-fit:cover;border-radius:6px">`).join('')}</div>` : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:start;flex-wrap:wrap">${actionsHtml}</div>
        </div>
      </div></div>`;
    }

    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Listings Moderation</h1>
      <p class="section-sub">Products and services wait here until approved — nothing goes live without your review.</p>

      <h3 style="margin-top:20px">Pending Approval (${pending.length})</h3>
      ${pending.length ? pending.map(l => listingCard(l, `
        <button class="btn btn-gold btn-sm" onclick="setListingStatus('${l.type}','${l.id}','active')">Approve</button>
        <button class="btn btn-outline btn-sm" onclick="rejectListing('${l.type}','${l.id}')">Reject</button>
      `)).join('') : '<p style="color:var(--text-muted)">Nothing pending.</p>'}

      <h3 style="margin-top:28px">Live Listings (${active.length})</h3>
      ${active.length ? active.map(l => listingCard(l, `
        <button class="btn btn-outline btn-sm" onclick="pauseListing('${l.type}','${l.id}')">Pause</button>
        <button class="btn btn-outline btn-sm" onclick="discontinueListing('${l.type}','${l.id}')">Discontinue</button>
      `)).join('') : '<p style="color:var(--text-muted)">No live listings.</p>'}`;
  }
  window.setListingStatus = async (type, id, status) => {
    try { await API.put(`/admin/listings/${type}/${id}/status`, { status }); Toast.show(`Listing ${status}`); load('listings'); }
    catch (e) { Toast.show(e.message); }
  };
  window.rejectListing = (type, id) => {
    promptReason('Reject Listing', async (reason) => {
      await API.put(`/admin/listings/${type}/${id}/status`, { status: 'rejected', reason });
      Toast.show('Listing rejected');
      load('listings');
    });
  };
  window.pauseListing = (type, id) => {
    promptReason('Pause Listing', async (reason) => {
      await API.put(`/admin/listings/${type}/${id}/status`, { status: 'paused', reason });
      Toast.show('Listing paused');
      load('listings');
    });
  };
  window.discontinueListing = (type, id) => {
    promptReason('Discontinue Listing', async (reason) => {
      await API.put(`/admin/listings/${type}/${id}/status`, { status: 'deleted', reason });
      Toast.show('Listing discontinued');
      load('listings');
    });
  };

  // Messages — broadcast to everyone/a role, or a direct chat message to one account
  async function loadMessages() {
    const users = await API.get('/admin/users');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Messages</h1>

      <div class="card" style="margin:20px 0"><div class="card-body">
        <h3>Broadcast</h3>
        <p style="color:var(--text-muted);font-size:0.85rem">Sends a real notification to every matching account — appears in their notification bell immediately.</p>
        <div class="form-group"><label class="form-label">Send to</label>
          <select class="form-select" id="broadcastRole">
            <option value="all">Everyone</option>
            <option value="client">Clients</option>
            <option value="freelancer">Freelancers</option>
            <option value="worker">Workers</option>
            <option value="seller">Sellers</option>
            <option value="admin">Admins</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="broadcastTitle"></div>
        <div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" id="broadcastBody" rows="3"></textarea></div>
        <button class="btn btn-gold btn-sm" onclick="sendBroadcast()">Send Broadcast</button>
        <div id="broadcastResult" style="margin-top:10px;font-size:0.85rem;color:var(--text-muted)"></div>
      </div></div>

      <div class="card"><div class="card-body">
        <h3>Message an Individual Account</h3>
        <p style="color:var(--text-muted);font-size:0.85rem">Opens a real chat conversation with them — same inbox as any other message on the site.</p>
        <div class="form-group"><label class="form-label">Account</label>
          <select class="form-select" id="directUserSelect">
            <option value="">Select a user...</option>
            ${users.map(u => `<option value="${u.user_id}">${u.display_name} (${u.role}) — ${u.email || ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" id="directBody" rows="3"></textarea></div>
        <div class="form-group"><label class="form-label">Image or video attachment (optional)</label><input class="form-input" type="file" id="directMedia" accept="image/*,video/*"></div>
        <button class="btn btn-gold btn-sm" onclick="sendDirectMessage()">Send Message</button>
        <div id="directResult" style="margin-top:10px;font-size:0.85rem;color:var(--text-muted)"></div>
      </div></div>`;
  }
  window.sendBroadcast = async () => {
    const title = document.getElementById('broadcastTitle').value.trim();
    const body = document.getElementById('broadcastBody').value.trim();
    const target_role = document.getElementById('broadcastRole').value;
    if (!title || !body) return Toast.show('Title and message are required');
    const resEl = document.getElementById('broadcastResult');
    resEl.textContent = 'Sending...';
    try {
      const { sent } = await API.post('/admin/broadcast', { title, body, target_role });
      resEl.textContent = `Sent to ${sent} account(s).`;
      document.getElementById('broadcastTitle').value = '';
      document.getElementById('broadcastBody').value = '';
    } catch (e) { resEl.textContent = 'Error: ' + e.message; }
  };
  window.sendDirectMessage = async () => {
    const userId = document.getElementById('directUserSelect').value;
    const body = document.getElementById('directBody').value.trim();
    const file = document.getElementById('directMedia').files[0];
    if (!userId) return Toast.show('Select a user first');
    if (!body && !file) return Toast.show('Write a message or choose media first');
    const resEl = document.getElementById('directResult');
    resEl.textContent = 'Sending...';
    try {
      const conv = await API.post('/chat/conversations', { other_user_id: userId });
      const file_url = file ? await Upload.file(file) : null;
      const message_type = file ? (file.type.startsWith('video/') ? 'video' : 'image') : 'text';
      await API.post(`/chat/conversations/${conv.id}/messages`, { body, message_type, file_url });
      resEl.textContent = 'Sent — visible in their Messages inbox.';
      document.getElementById('directBody').value = '';
      document.getElementById('directMedia').value = '';
    } catch (e) { resEl.textContent = 'Error: ' + e.message; }
  };

  async function loadRecruitmentJobs() {
    const jobs = await API.get('/recruitment/admin/jobs');
    const grouped = jobs.reduce((groups, job) => {
      const key = job.ai_plan || 'basic';
      (groups[key] ||= []).push(job);
      return groups;
    }, {});
    const jobRows = rows => rows.map(j => `<tr><td>${j.title}</td><td>${j.company_name}</td><td>${j.ai_plan}</td><td><span class="badge badge-kyc">${j.approval_status}</span></td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="editRecruitmentJob('${j.id}')">Review / Edit</button>
        ${j.approval_status !== 'approved' ? `<button class="btn btn-gold btn-sm" onclick="setRecruitmentJobStatus('${j.id}','approved')">Approve</button>` : ''}
        ${j.approval_status !== 'rejected' ? `<button class="btn btn-outline btn-sm" onclick="rejectRecruitmentJob('${j.id}')">Reject</button>` : ''}
        ${j.approval_status === 'approved' ? `<button class="btn btn-outline btn-sm" onclick="suspendRecruitmentJob('${j.id}')">Suspend</button>` : ''}
      </td></tr>`).join('');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Recruitment Jobs</h1>
      <p class="section-sub">Review, edit, and approve jobs before they become public. Jobs are grouped by the recruiter’s selected AI plan.</p>
      ${Object.entries(grouped).map(([plan, rows]) => `<h3 style="margin-top:24px;text-transform:capitalize">${plan} plan (${rows.length})</h3><table class="table" style="margin-top:8px"><thead><tr><th>Title</th><th>Company</th><th>AI Plan</th><th>Status</th><th>Actions</th></tr></thead><tbody>${jobRows(rows)}</tbody></table>`).join('') || '<p style="color:var(--text-muted)">No recruitment jobs submitted yet.</p>'}`;
  }
  window.editRecruitmentJob = async (id) => {
    const job = await API.get('/recruitment/admin/jobs').then(rows => rows.find(row => row.id === id));
    if (!job) return Toast.show('Recruitment job not found');
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.55);overflow:auto;padding:24px';
    overlay.innerHTML = `<div class="card" style="max-width:720px;margin:24px auto"><div class="card-body"><h3>Review recruitment job</h3>
      <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="adminRjTitle" value="${job.title}"></div>
      <div class="form-group"><label class="form-label">Company</label><input class="form-input" id="adminRjCompany" value="${job.company_name}"></div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="adminRjDescription" rows="8">${job.description}</textarea></div>
      <div class="form-group"><label class="form-label">Required skills (comma-separated)</label><input class="form-input" id="adminRjSkills" value="${(job.required_skills || []).join(', ')}"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-outline" id="closeRjEdit">Cancel</button><button class="btn btn-gold" id="saveRjEdit">Save changes</button></div></div></div>`;
    document.body.append(overlay);
    overlay.querySelector('#closeRjEdit').onclick = () => overlay.remove();
    overlay.querySelector('#saveRjEdit').onclick = async () => {
      await API.put(`/recruitment/admin/jobs/${id}`, { title: overlay.querySelector('#adminRjTitle').value.trim(), company_name: overlay.querySelector('#adminRjCompany').value.trim(), description: overlay.querySelector('#adminRjDescription').value.trim(), required_skills: overlay.querySelector('#adminRjSkills').value.split(',').map(s => s.trim()).filter(Boolean) });
      overlay.remove(); Toast.show('Recruitment job updated'); load('recruitment');
    };
  };
  window.setRecruitmentJobStatus = async (id, approval_status) => {
    await API.put(`/recruitment/admin/jobs/${id}/status`, { approval_status });
    Toast.show('Recruitment job ' + approval_status);
    load('recruitment');
  };
  window.rejectRecruitmentJob = (id) => {
    promptReason('Reject Recruitment Job', async (reason) => {
      await API.put(`/recruitment/admin/jobs/${id}/status`, { approval_status: 'rejected', reason });
      Toast.show('Recruitment job rejected');
      load('recruitment');
    });
  };
  window.suspendRecruitmentJob = (id) => {
    promptReason('Suspend Recruitment Job', async (reason) => {
      await API.put(`/recruitment/admin/jobs/${id}/status`, { approval_status: 'suspended', reason });
      Toast.show('Recruitment job suspended');
      load('recruitment');
    });
  };

  async function loadDisputes() {
    const d = await API.get('/admin/disputes');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Disputes</h1>
      ${d.length ? d.map(x => `<div class="card" style="margin-top:16px"><div class="card-body">
        <strong>${x.reason}</strong><br><span style="font-size:0.85rem;color:var(--text-muted)">${x.status} • ${timeAgo(x.created_at)}</span>
        <div style="margin-top:12px;display:flex;gap:8px"><button class="btn btn-gold btn-sm" onclick="resolveDispute('${x.id}','resolved')">Resolve</button><button class="btn btn-outline btn-sm" onclick="resolveDispute('${x.id}','dismissed')">Dismiss</button><button class="btn btn-outline btn-sm" onclick="deleteDispute('${x.id}')">Delete</button></div>
      </div></div>`).join('') : '<p style="color:var(--text-muted);margin-top:24px">No disputes.</p>'}`;
  }
  window.resolveDispute = async (id, status) => { await API.put(`/admin/disputes/${id}`, { status }); Toast.show('Dispute ' + status); load('disputes'); };
  window.deleteDispute = async id => { if (!confirm('Delete this dispute?')) return; try { await API.del(`/admin/disputes/${id}`); Toast.show('Dispute deleted'); load('disputes'); } catch(e) { Toast.show(e.message); } };

  async function loadPayments() {
    const p = await API.get('/admin/payments');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Payments</h1>
      <table class="table" style="margin-top:24px"><thead><tr><th>Client</th><th>Worker</th><th>Amount</th><th>Fee</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${p.map(x => `<tr><td>${x.client?.display_name || ''}</td><td>${x.worker?.display_name || ''}</td><td>${fmtPrice(x.amount)}</td><td>${fmtPrice(x.service_fee)}</td><td>${x.status}</td>
        <td>${x.status === 'in_escrow' ? `<button class="btn btn-gold btn-sm" onclick="releasePay('${x.id}')">Release</button>` : ''}</td></tr>`).join('')}
      </tbody></table>`;
  }
  window.releasePay = async (id) => { await API.put(`/admin/payments/${id}/release`); Toast.show('Payment released to worker'); load('payments'); };

  async function loadRevenue() {
    const p = await API.get('/admin/payments');
    const released = p.filter(x => x.status === 'released');
    const total = released.reduce((s, x) => s + Number(x.service_fee || 0), 0);
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Revenue</h1>
      <div class="stat-card" style="margin-top:24px"><div class="stat-num">${fmtPrice(total)}</div><div class="stat-label">Total platform fees collected</div></div>
      <p style="margin-top:16px;color:var(--text-soft)">${released.length} completed transactions.</p>`;
  }

  async function loadAudit() {
    const a = await API.get('/admin/audit');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Audit Logs</h1>
      <table class="table" style="margin-top:24px"><thead><tr><th>Actor</th><th>Action</th><th>Target</th><th>Time</th></tr></thead><tbody>
      ${a.map(x => `<tr><td>${x.actor?.display_name || 'system'}</td><td>${x.action}</td><td>${x.target_type || ''}</td><td>${timeAgo(x.created_at)}</td></tr>`).join('') || '<tr><td colspan="4">No logs.</td></tr>'}
      </tbody></table>`;
  }

  async function loadSubs() {
    const s = await API.get('/admin/subscriptions');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Subscription Approvals</h1>
      ${s.length ? s.map(x => `<div class="card" style="margin-top:16px"><div class="card-body" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div><strong>${x.user?.display_name}</strong> wants <span class="badge badge-gold">${x.tier}</span> (${fmtPrice(x.amount)})<br><span style="font-size:0.85rem;color:var(--text-muted)">${timeAgo(x.created_at)}</span></div>
        <div style="display:flex;gap:8px"><button class="btn btn-gold btn-sm" onclick="reviewSub('${x.id}','approved')">Approve</button><button class="btn btn-outline btn-sm" onclick="reviewSub('${x.id}','rejected')">Reject</button><button class="btn btn-outline btn-sm" onclick="reviewSub('${x.id}','refunded')">Refund</button></div>
      </div></div>`).join('') : '<p style="color:var(--text-muted);margin-top:24px">No pending subscriptions.</p>'}`;
  }
  window.reviewSub = async (id, status) => {
    if (status === 'rejected' || status === 'refunded') {
      return promptReason(status === 'rejected' ? 'Reject Subscription' : 'Refund Subscription', async (reason) => {
        await API.put(`/admin/subscriptions/${id}`, { status, reason });
        Toast.show('Subscription ' + status);
        load('subs');
      });
    }
    await API.put(`/admin/subscriptions/${id}`, { status });
    Toast.show('Subscription ' + status);
    load('subs');
  };

  async function loadAI() {
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">AI Ranking Control</h1>
      <p class="section-sub">Configure AI ranking weights for smart search and recommendations.</p>
      <div class="card" style="margin-top:24px"><div class="card-body">
        <h3>Ranking weights</h3>
        <div class="form-group"><label class="form-label">Subscription tier weight</label><input class="form-input" type="number" value="30" id="w_tier"></div>
        <div class="form-group"><label class="form-label">Rating weight</label><input class="form-input" type="number" value="25" id="w_rating"></div>
        <div class="form-group"><label class="form-label">Completion rate weight</label><input class="form-input" type="number" value="15" id="w_completion"></div>
        <div class="form-group"><label class="form-label">Reviews weight</label><input class="form-input" type="number" value="10" id="w_reviews"></div>
        <div class="form-group"><label class="form-label">Response speed weight</label><input class="form-input" type="number" value="10" id="w_response"></div>
        <div class="form-group"><label class="form-label">Location relevance weight</label><input class="form-input" type="number" value="10" id="w_location"></div>
        <button class="btn btn-gold" onclick="Toast.show('AI weights saved (placeholder)')">Save Weights</button>
      </div></div>`;
  }

  async function loadAds() {
    const ads = await API.get('/admin/ads');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Content & Ads Management</h1>
      <div class="card" style="margin:24px 0"><div class="card-body">
        <h3>Create Ad / Post</h3>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="adTitle"></div>
          <div class="form-group"><label class="form-label">Media (image/video)</label>
            <input class="form-input" type="file" id="adMediaInput" accept="image/*,video/*">
            <div id="adMediaPreview" style="margin-top:6px"></div>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="adDesc"></textarea></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Link URL (optional)</label><input class="form-input" id="adLink"></div>
          <div class="form-group"><label class="form-label">Link behavior</label><select class="form-select" id="adTab"><option value="true">Open new tab</option><option value="false">Same tab</option></select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Ad type</label><select class="form-select" id="adType"><option>banner</option><option>sidebar</option><option>popup</option><option>feed</option><option>hero</option></select></div>
          <div class="form-group"><label class="form-label">Target page</label><select class="form-select" id="adPage"><option>all</option><option>landing</option><option>homepage</option><option>market</option><option>category</option><option>chat</option><option>payment</option><option>jobs</option></select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Schedule (datetime)</label><input class="form-input" type="datetime-local" id="adSchedule"></div>
          <div class="form-group"><label class="form-label">Expiry (datetime)</label><input class="form-input" type="datetime-local" id="adExpiry"></div>
        </div>
        <button class="btn btn-gold" onclick="createAd(this)">Create Ad</button>
      </div></div>
      <h3>Existing Ads</h3>
      ${ads.length ? ads.map(a => `<div class="card" style="margin-top:12px"><div class="card-body" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div><strong>${a.title}</strong> <span class="badge badge-kyc">${a.ad_type} • ${a.target_page}</span><br><span style="font-size:0.85rem;color:var(--text-muted)">${a.status} • ${timeAgo(a.created_at)}</span></div>
        <button class="btn btn-outline btn-sm" onclick="deleteAd('${a.id}')">Delete</button>
      </div></div>`).join('') : '<p style="color:var(--text-muted)">No ads yet.</p>'}`;
  }
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'adMediaInput') return;
    const file = e.target.files[0];
    const preview = document.getElementById('adMediaPreview');
    if (!preview) return;
    if (!file) { preview.innerHTML = ''; return; }
    preview.textContent = `Selected: ${file.name}`;
  });
  window.createAd = async (btn) => {
    try {
      const file = document.getElementById('adMediaInput').files[0];
      let media_url = null;
      if (file) {
        if (btn) { btn.disabled = true; btn.textContent = 'Uploading...'; }
        media_url = await Upload.file(file);
      }
      await API.post('/admin/ads', {
        title: document.getElementById('adTitle').value,
        description: document.getElementById('adDesc').value,
        media_url,
        link_url: document.getElementById('adLink').value,
        link_new_tab: document.getElementById('adTab').value === 'true',
        ad_type: document.getElementById('adType').value,
        target_page: document.getElementById('adPage').value,
        schedule_at: document.getElementById('adSchedule').value || new Date().toISOString(),
        expires_at: document.getElementById('adExpiry').value || null
      });
      Toast.show('Ad created'); load('ads');
    } catch (e) { Toast.show(e.message); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Create Ad'; } }
  };
  window.deleteAd = async (id) => { await API.del(`/admin/ads/${id}`); Toast.show('Ad deleted'); load('ads'); };

  // Google AdSense — real Google ad network, distinct from the custom ads system above.
  const ADSENSE_PLACEMENTS = [
    { key: 'homepage_banner', label: 'Homepage Banner', note: 'Renders near the top of the homepage.' },
    { key: 'category_between_listings', label: 'Category / Listing Pages (Between Listings)', note: 'Renders on Hire, Shop, and Category pages.' },
    { key: 'footer', label: 'Footer', note: 'Renders in the footer on every page site-wide.' },
    { key: 'sidebar', label: 'Sidebar', note: 'Renders in the sidebar on blog post pages.' },
    { key: 'blog_news', label: 'Blog / News', note: 'Renders on the blog listing page.' },
  ];
  async function loadAdsense() {
    const settings = await API.get('/admin/settings');
    const units = await API.get('/admin/adsense-units');
    const unitMap = new Map(units.map(u => [u.placement, u]));
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Google AdSense</h1>
      <p class="section-sub">Google's ad network — Google chooses what ad shows and pays you per impression/click. This is separate from "Content & Ads" above, which is your own manually-placed sponsored content.</p>

      <div class="card" style="margin:20px 0"><div class="card-body">
        <h3>How this works</h3>
        <ol style="padding-left:18px;color:var(--text-soft);line-height:1.7">
          <li>Sign up at <a href="https://adsense.google.com" target="_blank" rel="noopener">adsense.google.com</a> with this site's URL, and wait for Google's approval (requires real content and traffic — this can take days).</li>
          <li>Once approved, copy your <strong>Publisher ID</strong> (looks like <code>ca-pub-1234567890123456</code>) from Account → Account information, and paste it below.</li>
          <li>In Google's dashboard, go to Ads → By ad unit → create a new ad unit for each placement you want (e.g. "Homepage Banner"). Google gives you a <strong>Slot ID</strong> (a number) for each one — paste each into the matching row below.</li>
          <li>Turn on "Enable AdSense" below. Google's script loads automatically on every page from then on, and each placement fills in wherever this site already has a spot for it.</li>
        </ol>
      </div></div>

      <div class="card" style="margin-bottom:20px"><div class="card-body">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="adsenseEnabled" ${settings?.adsense_enabled ? 'checked' : ''}> Enable Google AdSense site-wide</label>
        <div class="form-group" style="margin-top:12px;max-width:420px"><label class="form-label">Publisher ID</label><input class="form-input" id="adsensePubId" placeholder="ca-pub-1234567890123456" value="${settings?.adsense_publisher_id || ''}"></div>
        <button class="btn btn-gold" style="margin-top:8px" onclick="saveAdsenseGlobal()">Save</button>
      </div></div>

      <h3>Ad Placements</h3>
      ${ADSENSE_PLACEMENTS.map(p => {
        const u = unitMap.get(p.key);
        return `<div class="card" style="margin-top:12px"><div class="card-body">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div><strong>${p.label}</strong><div style="font-size:0.85rem;color:var(--text-muted)">${p.note}</div></div>
            <label style="display:flex;align-items:center;gap:6px;font-size:0.9rem"><input type="checkbox" id="active_${p.key}" ${u?.is_active !== false ? 'checked' : ''}> Active</label>
          </div>
          <div class="form-row" style="margin-top:10px">
            <div class="form-group"><label class="form-label">Slot ID</label><input class="form-input" id="slot_${p.key}" placeholder="1234567890" value="${u?.slot_id || ''}"></div>
            <div class="form-group"><label class="form-label">Format</label>
              <select class="form-select" id="format_${p.key}">
                ${['auto', 'rectangle', 'in-feed', 'in-article'].map(f => `<option value="${f}" ${u?.ad_format === f ? 'selected' : ''}>${f}</option>`).join('')}
              </select>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="saveAdsenseUnit('${p.key}', ${u ? `'${u.id}'` : 'null'})">Save Placement</button>
        </div></div>`;
      }).join('')}`;
  }
  window.saveAdsenseGlobal = async () => {
    try {
      await API.put('/admin/settings', {
        adsense_enabled: document.getElementById('adsenseEnabled').checked,
        adsense_publisher_id: document.getElementById('adsensePubId').value.trim()
      });
      Toast.show('AdSense settings saved');
    } catch (e) { Toast.show(e.message); }
  };
  window.saveAdsenseUnit = async (placement, existingId) => {
    const slot_id = document.getElementById(`slot_${placement}`).value.trim();
    if (!slot_id) return Toast.show('Enter a Slot ID first');
    const payload = { placement, slot_id, ad_format: document.getElementById(`format_${placement}`).value, is_active: document.getElementById(`active_${placement}`).checked };
    try {
      if (existingId) await API.put(`/admin/adsense-units/${existingId}`, payload);
      else await API.post('/admin/adsense-units', payload);
      Toast.show('Placement saved');
      load('adsense');
    } catch (e) { Toast.show(e.message); }
  };

  // Blog / News
  function slugify(title) { return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
  async function loadBlog() {
    const posts = await API.get('/admin/blog');
    document.getElementById('adminMain').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <h1 class="section-title">Blog / News</h1>
        <button class="btn btn-gold" onclick="showBlogForm()">+ New Post</button>
      </div>
      <div id="blogFormBox" style="display:none;margin:20px 0"></div>
      <div id="blogListBox" style="margin-top:20px">
        ${posts.length ? posts.map(p => `<div class="card" style="margin-bottom:10px"><div class="card-body" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div><strong>${p.title}</strong> <span class="badge badge-kyc">${p.status}</span><div class="card-meta">${new Date(p.created_at).toLocaleDateString()}</div></div>
          <div style="display:flex;gap:8px">
            <a class="btn btn-outline btn-sm" href="/blog-post.html?slug=${p.slug}" target="_blank">View</a><button class="btn btn-outline btn-sm" onclick='showBlogForm(${JSON.stringify(p).replace(/'/g, "&apos;")})'>Edit</button>
            <button class="btn btn-outline btn-sm" onclick="deleteBlogPost('${p.id}')">Delete</button>
          </div>
        </div></div>`).join('') : '<p style="color:var(--text-muted)">No posts yet.</p>'}
      </div>`;
  }
  window.showBlogForm = (post) => {
    const box = document.getElementById('blogFormBox');
    box.style.display = 'block';
    box.innerHTML = `<div class="card"><div class="card-body">
      <h3>${post ? 'Edit Post' : 'New Post'}</h3>
      <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="bpTitle" value="${post?.title || ''}"></div>
      <div class="form-group"><label class="form-label">Excerpt</label><input class="form-input" id="bpExcerpt" value="${post?.excerpt || ''}"></div>
      <div class="form-group"><label class="form-label">Cover image</label><input class="form-input" type="file" id="bpCoverInput" accept="image/*"><div id="bpCoverPreview" style="margin-top:6px">${post?.cover_image ? `<img src="${post.cover_image}" style="width:100px;border-radius:8px">` : ''}</div></div>
      <div class="form-group"><label class="form-label">Body</label><textarea class="form-textarea" id="bpBody" rows="8">${post?.body || ''}</textarea></div>
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-select" id="bpStatus"><option value="draft" ${post?.status === 'draft' ? 'selected' : ''}>Draft</option><option value="published" ${post?.status === 'published' ? 'selected' : ''}>Published</option></select>
      </div>
      <button class="btn btn-gold" onclick="saveBlogPost(${post ? `'${post.id}'` : 'null'})">Save</button>
    </div></div>`;
    let uploadedCover = post?.cover_image || null;
    document.getElementById('bpCoverInput').addEventListener('change', async () => {
      const file = document.getElementById('bpCoverInput').files[0];
      if (!file) return;
      try { uploadedCover = await Upload.file(file); document.getElementById('bpCoverPreview').innerHTML = `<img src="${uploadedCover}" style="width:100px;border-radius:8px">`; }
      catch (e) { Toast.show(e.message); }
    });
    window.__blogCover = () => uploadedCover;
  };
  window.saveBlogPost = async (id) => {
    const title = document.getElementById('bpTitle').value.trim();
    if (!title) return Toast.show('Title is required');
    const payload = {
      title, excerpt: document.getElementById('bpExcerpt').value.trim(),
      body: document.getElementById('bpBody').value, status: document.getElementById('bpStatus').value,
      cover_image: window.__blogCover ? window.__blogCover() : null
    };
    if (!id) payload.slug = slugify(title) + '-' + Date.now().toString(36);
    try {
      if (id) await API.put(`/admin/blog/${id}`, payload);
      else await API.post('/admin/blog', payload);
      Toast.show('Post saved');
      load('blog');
    } catch (e) { Toast.show(e.message); }
  };
  window.deleteBlogPost = async (id) => { await API.del(`/admin/blog/${id}`); Toast.show('Post deleted'); load('blog'); };

  // Site Content — key/value editable blocks per page
  const CONTENT_PAGES = {
    homepage_hero: ['hero_title', 'hero_subtitle', 'cta_hire_label', 'cta_shop_label', 'cta_jobs_label', 'meta_title', 'meta_description'],
    about: ['heading', 'body', 'meta_title', 'meta_description'],
    contact: ['heading', 'body', 'meta_title', 'meta_description'],
    faq: ['heading', 'body', 'meta_title', 'meta_description'],
    hire: ['meta_title', 'meta_description'],
    shop: ['meta_title', 'meta_description'],
    jobs: ['meta_title', 'meta_description'],
    terms: ['body'],
    privacy: ['body'],
    refund: ['body'],
    footer: ['tagline'],
  };
  async function loadSiteContent() {
    const rows = await API.get('/admin/site-content');
    const map = new Map(rows.map(r => [`${r.page_key}:${r.section_key}`, r]));
    let heroImages = [];
    try { heroImages = JSON.parse(map.get('homepage_hero:hero_images')?.value || '[]'); } catch { heroImages = []; }

    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Site Content</h1>
      <p class="section-sub">Edit text blocks shown on public pages. Changes go live immediately.</p>

      <div class="card" style="margin-top:20px"><div class="card-body">
        <h3>Hero Slideshow Images</h3>
        <p style="color:var(--text-muted);font-size:0.85rem">Shown on the homepage, auto-rotating every 5 seconds.</p>
        <input class="form-input" type="file" id="heroImagesInput" accept="image/*" multiple style="margin-top:8px">
        <div id="heroImagesPreview" style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap"></div>
        <button class="btn btn-gold btn-sm" style="margin-top:12px" onclick="saveHeroImages()">Save Slideshow</button>
      </div></div>

      ${Object.entries(CONTENT_PAGES).map(([page, sections]) => `
        <div class="card" style="margin-top:20px"><div class="card-body">
          <h3 style="text-transform:capitalize">${page.replace('_', ' ')}</h3>
          ${sections.filter(sec => sec !== 'hero_images').map(sec => {
            const existing = map.get(`${page}:${sec}`);
            const id = `sc_${page}_${sec}`;
            return `<div class="form-group"><label class="form-label" style="text-transform:capitalize">${sec.replace('_', ' ')}</label><textarea class="form-textarea" rows="2" id="${id}">${existing?.value || ''}</textarea></div>`;
          }).join('')}
           <button class="btn btn-gold btn-sm" onclick="saveSiteContent('${page}')">Save ${page.replace('_', ' ')}</button>
        </div></div>`).join('')}`;

    window.__heroImages = heroImages;
    renderHeroImagesPreview();
    document.getElementById('heroImagesInput').addEventListener('change', async () => {
      const files = Array.from(document.getElementById('heroImagesInput').files);
      if (!files.length) return;
      Toast.show('Uploading...');
      try {
        for (const file of files) window.__heroImages.push(await Upload.file(file));
        renderHeroImagesPreview();
        Toast.show('Images uploaded — click Save Slideshow to publish');
      } catch (e) { Toast.show(e.message); }
      document.getElementById('heroImagesInput').value = '';
    });
  }
  function renderHeroImagesPreview() {
    const box = document.getElementById('heroImagesPreview');
    if (!box) return;
    box.innerHTML = (window.__heroImages || []).map((url, i) => `
      <div style="position:relative">
        <img src="${url}" style="width:90px;height:90px;object-fit:cover;border-radius:8px">
        <button type="button" onclick="window.__removeHeroImage(${i})" style="position:absolute;top:-6px;right:-6px;background:#b91c1c;color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:12px;cursor:pointer">×</button>
      </div>`).join('') || '<p style="color:var(--text-muted);font-size:0.85rem">No images yet — using the built-in defaults.</p>';
  }
  window.__removeHeroImage = (i) => { window.__heroImages.splice(i, 1); renderHeroImagesPreview(); };
  window.saveHeroImages = async () => {
    try {
      await API.put('/admin/site-content', { page_key: 'homepage_hero', section_key: 'hero_images', content_type: 'json', value: JSON.stringify(window.__heroImages || []) });
      Toast.show('Slideshow saved — live on the homepage now');
    } catch (e) { Toast.show(e.message); }
  };
  window.saveSiteContent = async (page) => {
    try {
      const sections = (CONTENT_PAGES[page] || []).filter(sec => sec !== 'hero_images');
      for (const sec of sections) {
        const value = document.getElementById(`sc_${page}_${sec}`).value;
        await API.put('/admin/site-content', { page_key: page, section_key: sec, value });
      }
      Toast.show('Saved');
    } catch (e) { Toast.show(e.message); }
  };

  // Homepage Builder — real drag-and-drop reordering of the actual homepage sections
  const HOMEPAGE_SECTION_LABELS = {
    hero: 'Hero Slideshow', trust: 'Trust Indicators', ecosystems: 'Hire/Shop/Jobs Ecosystems',
    featured_categories: 'Featured Categories', about: 'About / Mission', top_sellers: 'Top Sellers',
    recent_jobs: 'Recently Completed Jobs', testimonials: 'Testimonials'
  };
  async function loadHomepageBuilder() {
    const settings = await API.get('/admin/settings');
    const saved = Array.isArray(settings?.homepage_sections) && settings.homepage_sections.length
      ? settings.homepage_sections
      : Object.keys(HOMEPAGE_SECTION_LABELS).map(key => ({ key, visible: true }));
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Homepage Builder</h1>
      <p class="section-sub">Drag to reorder. Uncheck to hide a section entirely. Changes apply live on the homepage.</p>
      <div id="hpSectionList" style="margin:20px 0;max-width:520px;display:flex;flex-direction:column;gap:8px"></div>
      <button class="btn btn-gold" onclick="saveHomepageSections()">Save Order</button>`;
    const list = document.getElementById('hpSectionList');
    list.innerHTML = saved.map(({ key, visible }) => `
      <div class="card hp-section-row" draggable="true" data-key="${key}" style="padding:12px 16px;cursor:grab;display:flex;align-items:center;gap:12px">
        <span style="opacity:0.5">☰</span>
        <label style="display:flex;align-items:center;gap:8px;flex:1;margin:0"><input type="checkbox" class="hp-visible" ${visible !== false ? 'checked' : ''}> ${HOMEPAGE_SECTION_LABELS[key] || key}</label>
      </div>`).join('');

    let dragEl = null;
    list.querySelectorAll('.hp-section-row').forEach(row => {
      row.addEventListener('dragstart', () => { dragEl = row; row.style.opacity = '0.4'; });
      row.addEventListener('dragend', () => { row.style.opacity = '1'; dragEl = null; });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!dragEl || dragEl === row) return;
        const rect = row.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        row.parentElement.insertBefore(dragEl, before ? row : row.nextSibling);
      });
    });
  }
  window.saveHomepageSections = async () => {
    const rows = document.querySelectorAll('.hp-section-row');
    const homepage_sections = Array.from(rows).map(row => ({
      key: row.dataset.key,
      visible: row.querySelector('.hp-visible').checked
    }));
    try {
      await API.put('/admin/settings', { homepage_sections });
      Toast.show('Homepage layout saved');
    } catch (e) { Toast.show(e.message); }
  };

  // API Keys — read-only status. Real values live in .env, never the database.
  const API_KEY_INFO = [
    { id: 'openai', label: 'OpenAI', url: 'https://platform.openai.com/api-keys', note: 'Powers CV screening, fraud-check, price suggestions upgrades' },
    { id: 'gemini', label: 'Google Gemini', url: 'https://aistudio.google.com/apikey', note: 'Free tier available — recommended default' },
    { id: 'groq', label: 'Groq', url: 'https://console.groq.com/keys', note: 'Generous free tier — recommended default' },
    { id: 'googleVision', label: 'Google Cloud Vision (OCR)', url: 'https://console.cloud.google.com', note: 'Real resume/ID text extraction — 1,000 free/month' },
    { id: 'googleTranslate', label: 'Google Translate', url: 'https://console.cloud.google.com', note: 'Real chat translation — can reuse the Vision key' },
    { id: 'textract', label: 'AWS Textract (OCR alternative)', url: 'https://console.aws.amazon.com/iam', note: 'Needs AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY' },
    { id: 'whisper', label: 'OpenAI Whisper', url: 'https://platform.openai.com/api-keys', note: 'Video response transcription — no free tier' },
    { id: 'resendEmail', label: 'Resend (email sending)', url: 'https://resend.com/api-keys', note: 'Needed for welcome/payment/KYC emails to actually send' },
    { id: 'supabaseServiceRole', label: 'Supabase Service Role', url: 'https://supabase.com/dashboard', note: 'Needed for automated backups' },
  ];
  async function loadApiKeys() {
    const status = await API.get('/admin/api-keys-status');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">API Keys</h1>
      <p class="section-sub">Read-only status — set/change actual values in your host's environment variables (.env), never here. This page never stores or displays full key values.</p>
      <table class="admin-table" style="margin-top:20px">
        <thead><tr><th>Provider</th><th>Status</th><th>Value</th><th>Used for</th><th></th></tr></thead>
        <tbody>${API_KEY_INFO.map(p => {
          const s = status[p.id] || {};
          return `<tr>
            <td>${p.label}</td>
            <td>${s.configured ? '<span class="badge badge-verified">Configured</span>' : '<span class="badge badge-kyc">Not set</span>'}</td>
            <td style="font-family:monospace;font-size:0.85rem">${s.masked || '—'}</td>
            <td style="font-size:0.85rem;color:var(--text-muted)">${p.note}</td>
            <td><a href="${p.url}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">Get key</a></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  // Email Templates
  async function loadEmailTemplates() {
    const templates = await API.get('/admin/email-templates');
    const status = await API.get('/admin/api-keys-status');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Email Templates</h1>
      <p class="section-sub">${status.resendEmail?.configured
        ? '✅ Email sending is configured (Resend). These templates will actually send.'
        : '⚠️ Email sending is NOT configured yet — set RESEND_API_KEY and RESEND_FROM_EMAIL to activate. Until then, sends are logged but not delivered.'}</p>
      ${templates.map(t => `<div class="card" style="margin-top:16px"><div class="card-body">
        <h3 style="text-transform:capitalize">${t.template_key.replace(/_/g, ' ')}</h3>
        <div class="form-group"><label class="form-label">Subject (use {{variable}} for placeholders)</label><input class="form-input" id="et_subject_${t.id}" value="${t.subject.replace(/"/g, '&quot;')}"></div>
        <div class="form-group"><label class="form-label">Body</label><textarea class="form-textarea" id="et_body_${t.id}" rows="5">${t.body}</textarea></div>
        <button class="btn btn-gold btn-sm" onclick="saveEmailTemplate('${t.id}')">Save</button>
      </div></div>`).join('')}`;
  }
  window.saveEmailTemplate = async (id) => {
    try {
      await API.put(`/admin/email-templates/${id}`, {
        subject: document.getElementById(`et_subject_${id}`).value,
        body: document.getElementById(`et_body_${id}`).value
      });
      Toast.show('Template saved');
    } catch (e) { Toast.show(e.message); }
  };

  // Testimonials moderation
  async function loadTestimonials() {
    const rows = await API.get('/admin/testimonials');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Testimonials</h1>
      ${rows.length ? rows.map(t => `<div class="card" style="margin-top:12px"><div class="card-body">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div><strong>${t.name}</strong> ${t.role_label ? `<span style="color:var(--text-muted)">— ${t.role_label}</span>` : ''}<br>
            <span class="badge badge-kyc">${t.status}</span> <span style="font-size:0.85rem;color:var(--text-muted)">${timeAgo(t.created_at)}</span></div>
          <div style="display:flex;gap:8px">
            ${t.status !== 'approved' ? `<button class="btn btn-gold btn-sm" onclick="setTestimonialStatus('${t.id}','approved')">Approve</button>` : ''}
            ${t.status !== 'rejected' ? `<button class="btn btn-outline btn-sm" onclick="setTestimonialStatus('${t.id}','rejected')">Reject</button>` : ''}
            <button class="btn btn-outline btn-sm" onclick="deleteTestimonial('${t.id}')">Delete</button>
          </div>
        </div>
        <p style="margin-top:8px;color:var(--text-soft)">"${t.quote}"</p>
      </div></div>`).join('') : '<p style="color:var(--text-muted);margin-top:20px">No testimonials yet.</p>'}`;
  }
  window.setTestimonialStatus = async (id, status) => { await API.put(`/admin/testimonials/${id}`, { status }); Toast.show(`Testimonial ${status}`); load('testimonials'); };
  window.deleteTestimonial = async (id) => { await API.del(`/admin/testimonials/${id}`); Toast.show('Deleted'); load('testimonials'); };

  // Featured Items
  async function loadFeatured() {
    const rows = await API.get('/admin/featured');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Featured Items</h1>
        <p class="section-sub">Pin an existing service, product, or job to a placement. You can also add a promotional image or video for the featured card.</p>
      <div class="card" style="margin:20px 0"><div class="card-body">
        <h3>Feature an item</h3>
         <div class="form-row">
          <div class="form-group"><label class="form-label">Type</label><select class="form-select" id="fType" onchange="searchFeaturable()"><option value="service">Service</option><option value="product">Product</option><option value="job">Job</option></select></div>
          <div class="form-group"><label class="form-label">Search by title</label><input class="form-input" id="fSearch" oninput="searchFeaturable()" placeholder="Start typing..."></div>
         </div>
         <div class="form-row">
           <div class="form-group"><label class="form-label">Promotional media (optional)</label><input class="form-input" type="file" id="fMedia" accept="image/*,video/*"></div>
           <div class="form-group"><label class="form-label">Display note (optional)</label><input class="form-input" id="fNote" maxlength="180" placeholder="Short promotional message"></div>
         </div>
        <div id="fResults" style="margin:8px 0;display:flex;flex-direction:column;gap:6px"></div>
        <input type="hidden" id="fItemId">
        <div id="fSelected" style="color:var(--text-muted);font-size:0.9rem;margin-bottom:10px"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Placement</label><select class="form-select" id="fPlacement"><option value="homepage">Homepage</option><option value="category">Category page</option><option value="search_top">Top of search</option></select></div>
          <div class="form-group"><label class="form-label">Expires (optional)</label><input class="form-input" type="datetime-local" id="fExpiry"></div>
        </div>
        <button class="btn btn-gold btn-sm" onclick="createFeatured()">Feature It</button>
      </div></div>
      <h3>Currently Featured</h3>
      ${rows.length ? rows.map(f => `<div class="card" style="margin-top:10px"><div class="card-body" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div><span class="badge badge-kyc">${f.item_type}</span> <span class="badge badge-kyc">${f.placement}</span> <span style="font-size:0.85rem;color:var(--text-muted)">${f.status}${f.expires_at ? ' • expires ' + new Date(f.expires_at).toLocaleDateString() : ''}</span></div>
        ${f.status === 'active' ? `<button class="btn btn-outline btn-sm" onclick="pauseFeatured('${f.id}')">Pause</button>` : ''}
      </div></div>`).join('') : '<p style="color:var(--text-muted);margin-top:12px">Nothing featured yet.</p>'}`;
  }
  let fSearchTimer;
  window.searchFeaturable = () => {
    clearTimeout(fSearchTimer);
    fSearchTimer = setTimeout(async () => {
      const type = document.getElementById('fType').value;
      const q = document.getElementById('fSearch').value;
      const results = await API.get(`/admin/featured/search?type=${type}&q=${encodeURIComponent(q)}`);
      document.getElementById('fResults').innerHTML = results.map(r => `<button type="button" class="btn btn-outline btn-sm" style="text-align:left" onclick="selectFeaturable('${r.id}', '${r.title.replace(/'/g, "\\'")}')">${r.title}</button>`).join('') || '<span style="color:var(--text-muted);font-size:0.85rem">No matches</span>';
    }, 300);
  };
  window.selectFeaturable = (id, title) => {
    document.getElementById('fItemId').value = id;
    document.getElementById('fSelected').textContent = `Selected: ${title}`;
  };
  window.createFeatured = async () => {
    const item_id = document.getElementById('fItemId').value;
    if (!item_id) return Toast.show('Search and select an item first');
    try {
       const media = document.getElementById('fMedia').files[0];
       const media_url = media ? await Upload.file(media) : null;
       await API.post('/admin/featured', {
        item_type: document.getElementById('fType').value,
        item_id,
        placement: document.getElementById('fPlacement').value,
         expires_at: document.getElementById('fExpiry').value || null,
         media_url,
         display_note: document.getElementById('fNote').value.trim() || null
      });
      Toast.show('Item featured');
      load('featured');
    } catch (e) { Toast.show(e.message); }
  };
  window.pauseFeatured = async (id) => { await API.del(`/admin/featured/${id}`); Toast.show('Paused'); load('featured'); };

  // Comments & Suggestions
  async function loadComments() {
    const rows = await API.get('/admin/comments');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Comments & Suggestions</h1>
      ${rows.length ? rows.map(c => `<div class="card" style="margin-top:12px"><div class="card-body">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div><strong>${c.name || 'Anonymous'}</strong> ${c.email ? `<span style="color:var(--text-muted)">(${c.email})</span>` : ''}<br>
            <span class="badge badge-kyc">${c.status}</span> <span style="font-size:0.85rem;color:var(--text-muted)">${timeAgo(c.created_at)}</span></div>
          <div style="display:flex;gap:8px">
            ${c.status !== 'read' ? `<button class="btn btn-outline btn-sm" onclick="setCommentStatus('${c.id}','read')">Mark Read</button>` : ''}
            ${c.status !== 'archived' ? `<button class="btn btn-outline btn-sm" onclick="setCommentStatus('${c.id}','archived')">Archive</button>` : ''}
            <button class="btn btn-outline btn-sm" onclick="deleteComment('${c.id}')">Delete</button>
          </div>
        </div>
        <p style="margin-top:8px;color:var(--text-soft)">${c.body}</p>
      </div></div>`).join('') : '<p style="color:var(--text-muted);margin-top:20px">No comments yet.</p>'}`;
  }
  window.setCommentStatus = async (id, status) => { await API.put(`/admin/comments/${id}`, { status }); Toast.show('Updated'); load('comments'); };
  window.deleteComment = async id => { if (!confirm('Delete this comment?')) return; try { await API.del(`/admin/comments/${id}`); Toast.show('Comment deleted'); load('comments'); } catch(e) { Toast.show(e.message); } };

  // Support Tickets
  async function loadSupportTickets() {
    const tickets = await API.get('/admin/support/tickets');
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Support Tickets</h1>
      <div id="ticketListAdmin">${tickets.length ? tickets.map(t => `
        <div class="card" style="margin-bottom:10px"><div class="card-body" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div style="cursor:pointer" onclick="openAdminTicket('${t.id}')"><strong>${t.subject}</strong><div class="card-meta">${new Date(t.updated_at).toLocaleString()}</div></div>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="badge badge-kyc">${t.priority}</span>
            <select class="form-select" style="padding:4px 8px;font-size:0.85rem" onchange="setTicketStatus('${t.id}', this.value)">
              ${['open','in_progress','resolved','closed'].map(s => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
            <button class="btn btn-outline btn-sm" onclick="deleteSupportTicket('${t.id}')">Delete</button>
          </div>
        </div></div>`).join('') : '<p style="color:var(--text-muted)">No tickets.</p>'}</div>
      <div id="adminTicketThread" style="margin-top:24px"></div>`;
  }
  window.setTicketStatus = async (id, status) => { await API.put(`/admin/support/tickets/${id}`, { status }); Toast.show('Status updated'); load('support'); };
  window.deleteSupportTicket = async id => { if (!confirm('Delete this support ticket and its messages?')) return; try { await API.del(`/admin/support/tickets/${id}`); Toast.show('Ticket deleted'); load('support'); } catch(e) { Toast.show(e.message); } };
  window.openAdminTicket = async (id) => {
    const { ticket, messages } = await API.get(`/admin/support/tickets/${id}`);
    document.getElementById('adminTicketThread').innerHTML = `
      <div class="card"><div class="card-body">
        <h3>${ticket.subject}</h3>
        <div style="margin:12px 0;display:flex;flex-direction:column;gap:10px">
          ${messages.map(m => `<div style="background:var(--bg-elev);padding:10px 14px;border-radius:10px">
            <div style="font-size:0.8rem;color:var(--text-muted)">${new Date(m.created_at).toLocaleString()}</div>
            <div>${m.body}</div>
          </div>`).join('')}
        </div>
        <form id="adminReplyForm">
          <div class="form-group"><textarea class="form-textarea" id="adminReplyBody" rows="3" placeholder="Reply to customer..." required></textarea></div>
          <button type="submit" class="btn btn-gold btn-sm">Send Reply</button>
        </form>
      </div></div>`;
    document.getElementById('adminReplyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = document.getElementById('adminReplyBody').value.trim();
      if (!body) return;
      try { await API.post(`/admin/support/tickets/${id}/messages`, { body }); openAdminTicket(id); }
      catch (err) { Toast.show(err.message); }
    });
  };

  async function loadExport() {
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Google Sheets Export</h1>
      <p class="section-sub">Export transaction data (placeholder — wire to Google Sheets API in production).</p>
      <div style="display:flex;gap:12px;margin:24px 0"><button class="btn btn-gold" onclick="exportSheet('processing')">Export Processing Jobs</button><button class="btn btn-gold" onclick="exportSheet('completed')">Export Completed Jobs</button></div>
      <div id="exportResult"></div>

      <h2 style="font-size:1.4rem;margin:32px 0 12px">Backup & Recovery</h2>
      <p class="section-sub" id="backupStatusLine">Checking automated backup status...</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        <button class="btn btn-outline" onclick="downloadBackup()">Download Full Backup (JSON)</button>
        <button class="btn btn-outline" onclick="runBackupNow()">Run Backup Now</button>
      </div>
      <div id="backupResult" style="margin-bottom:16px"></div>

      <h3 style="font-size:1.05rem;margin-bottom:8px">Recent Automated Backups</h3>
      <div id="autoBackupList" style="margin-bottom:24px;color:var(--text-muted);font-size:0.9rem">Loading...</div>

      <h3 style="font-size:1.05rem;margin-bottom:8px">Restore from Backup</h3>
      <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:8px">Merges the backup's rows back in — this never deletes anything currently live, it only adds/updates rows by matching ID. Safe to use even if you're not sure exactly what changed.</p>
      <input type="file" id="restoreFileInput" accept="application/json">
      <button class="btn btn-gold btn-sm" style="margin-top:8px" onclick="restoreBackup()">Restore</button>
      <div id="restoreResult" style="margin-top:12px;font-size:0.85rem"></div>`;

    const status = await API.get('/admin/backup/status').catch(() => ({ automatedEnabled: false }));
    document.getElementById('backupStatusLine').textContent = status.automatedEnabled
      ? 'Automated daily backups are ON (SUPABASE_SERVICE_ROLE_KEY is configured).'
      : 'Automated daily backups are OFF — set SUPABASE_SERVICE_ROLE_KEY to enable them. Manual download and restore below still work either way.';

    const list = await API.get('/admin/backup/list').catch(() => []);
    document.getElementById('autoBackupList').innerHTML = list.length
      ? list.map(f => `<div>${f.name} — ${new Date(f.created_at || f.updated_at).toLocaleString()}</div>`).join('')
      : 'No automated backups yet.';
  }
  window.runBackupNow = async () => {
    const resEl = document.getElementById('backupResult');
    resEl.textContent = 'Running backup...';
    try { await API.post('/admin/backup/run-now'); resEl.textContent = 'Backup complete.'; load('export'); }
    catch (e) { resEl.textContent = 'Error: ' + e.message; }
  };
  window.restoreBackup = async () => {
    const file = document.getElementById('restoreFileInput').files[0];
    const resEl = document.getElementById('restoreResult');
    if (!file) return Toast.show('Choose a backup JSON file first');
    resEl.textContent = 'Restoring...';
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      const { results } = await API.post('/admin/backup/restore', { bundle });
      resEl.innerHTML = Object.entries(results).map(([t, r]) => `${t}: ${r}`).join('<br>');
    } catch (e) { resEl.textContent = 'Error: ' + e.message; }
  };
  window.downloadBackup = async () => {
    const resEl = document.getElementById('backupResult');
    resEl.textContent = 'Preparing backup...';
    try {
      const token = Auth.getToken();
      const res = await fetch('/api/admin/backup/export', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Backup failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `skillbridge-backup-${Date.now()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      resEl.textContent = 'Backup downloaded.';
    } catch (e) { resEl.textContent = 'Error: ' + e.message; }
  };
  window.exportSheet = async (sheet) => {
    const r = await API.get(`/admin/export/${sheet}`);
    document.getElementById('exportResult').innerHTML = `<div class="card"><div class="card-body"><strong>${r.sheet}</strong> — ${r.rows.length} rows<br><span style="font-size:0.85rem;color:var(--text-muted)">Exported at ${new Date(r.exportedAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} (WAT)</span></div></div>`;
    Toast.show(`${r.rows.length} rows ready for Sheets`);
  };

  async function loadFraud() {
    const flags = await API.get('/admin/fraud-flags');
    const unresolved = flags.filter(f => !f.resolved);
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Fraud Monitoring</h1>
      <p class="section-sub">Real signals from payment proofs, KYC name mismatches, and repeated login failures — not a demo.</p>

      <h3 style="margin-top:20px">Unresolved (${unresolved.length})</h3>
      <div id="fraudFlagList" style="margin-top:10px">
        ${unresolved.length ? unresolved.map(f => `<div class="card" style="margin-bottom:10px"><div class="card-body">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div>
              <strong>${f.flag_type.replace(/_/g, ' ')}</strong>
              ${f.profile ? ` — ${f.profile.display_name || f.profile.email}` : ' — unknown/unregistered user'}
              <div class="card-meta">${timeAgo(f.created_at)}</div>
            </div>
            <div style="text-align:right">
              <span class="badge" style="background:${f.risk_score >= 50 ? '#fee2e2' : '#fef3c7'};color:${f.risk_score >= 50 ? '#b91c1c' : '#92400e'}">Risk: ${f.risk_score}</span>
              <button class="btn btn-outline btn-sm" style="margin-left:8px" onclick="resolveFraudFlag('${f.id}')">Resolve</button>
            </div>
          </div>
          <pre style="margin-top:8px;font-size:0.8rem;color:var(--text-muted);white-space:pre-wrap">${JSON.stringify(f.details, null, 2)}</pre>
        </div></div>`).join('') : '<p style="color:var(--text-muted)">No open fraud flags.</p>'}
      </div>

      <div class="card" style="margin-top:24px"><div class="card-body">
        <h3>Manual check</h3>
        <p style="color:var(--text-muted);font-size:0.85rem">Run an ad-hoc check against arbitrary data (doesn't create a flag).</p>
        <div class="form-group"><label class="form-label">Check type</label><select class="form-select" id="fraudType"><option value="payment_proof">Payment proof</option><option value="kyc">KYC</option><option value="scam">Scam patterns</option><option value="spam">Spam</option></select></div>
        <button class="btn btn-outline btn-sm" onclick="runFraud()">Run Check</button>
        <div id="fraudResult" style="margin-top:16px"></div>
      </div></div>`;
  }
  window.resolveFraudFlag = async (id) => { await API.put(`/admin/fraud-flags/${id}/resolve`); Toast.show('Resolved'); load('fraud'); };
  window.runFraud = async () => {
    const r = await API.post('/ai/fraud-check', { type: document.getElementById('fraudType').value, data: {} });
    document.getElementById('fraudResult').innerHTML = `<span class="badge ${r.risk === 'high' ? 'badge-kyc' : r.risk === 'medium' ? 'badge-gold' : 'badge-verified'}">${r.risk} risk</span> ${r.flags?.join(', ') || ''}`;
  };

  async function loadSettings() {
    const s = await API.get('/admin/settings');
    const plans = await API.get('/admin/plans').catch(() => []);
    document.getElementById('adminMain').innerHTML = `
      <h1 class="section-title">Platform Settings</h1>
      <div class="grid grid-2" style="margin-top:24px;gap:24px">

        <div class="card"><div class="card-body">
          <h3>General</h3>
          <div class="form-group"><label class="form-label">Site name</label><input class="form-input" value="${s?.site_name || 'SkillBridge'}" id="setSiteName"></div>
          <div class="form-group"><label class="form-label">Logo URL</label><input class="form-input" value="${s?.logo_url || ''}" id="setLogo"><label class="form-label" style="margin-top:8px">or upload logo</label><input class="form-input" type="file" id="setLogoFile" accept="image/*"></div>
          <div class="form-group"><label class="form-label">Favicon URL</label><input class="form-input" value="${s?.favicon_url || ''}" id="setFavicon"><label class="form-label" style="margin-top:8px">or upload favicon</label><input class="form-input" type="file" id="setFaviconFile" accept="image/*,.ico"></div>
          <p style="font-size:.82rem;color:var(--text-muted)">Maintenance mode blocks all non-admin API activity with a temporary-maintenance message. Administrators can still sign in and turn it off.</p>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Default currency</label><input class="form-input" value="${s?.default_currency || 'NGN'}" id="setCurrency"></div>
            <div class="form-group"><label class="form-label">Default timezone</label><input class="form-input" value="${s?.default_timezone || 'Africa/Lagos'}" id="setTz"></div>
          </div>
          <label style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" id="setMaint" ${s?.maintenance_mode ? 'checked' : ''}> Maintenance mode</label>
          <label style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" id="setReg" ${s?.registrations_enabled !== false ? 'checked' : ''}> Registrations enabled</label>
          <label style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" id="setGuest" ${s?.guest_browsing_enabled !== false ? 'checked' : ''}> Guest browsing enabled</label>
          <button class="btn btn-gold" style="margin-top:16px" onclick="saveGeneral()">Save General</button>
        </div></div>

        <div class="card"><div class="card-body">
          <h3>Commissions & Escrow</h3>
          <div class="form-group"><label class="form-label">Freelancer commission (%)</label><input class="form-input" type="number" step="0.1" value="${s?.commission_freelancer ?? 10}" id="setCommFree"></div>
          <div class="form-group"><label class="form-label">Worker commission (%)</label><input class="form-input" type="number" step="0.1" value="${s?.commission_worker ?? 7}" id="setCommWorker"></div>
          <div class="form-group"><label class="form-label">Seller commission (%)</label><input class="form-input" type="number" step="0.1" value="${s?.commission_seller ?? 5}" id="setCommSeller"></div>
          <div class="form-group"><label class="form-label">Default service fee (%) — fallback</label><input class="form-input" type="number" value="${s?.service_fee_percent || 10}" id="setFee"></div>
          <div class="form-group"><label class="form-label">Escrow hold (hours before Received)</label><input class="form-input" type="number" value="${s?.escrow_hold_hours || 1}" id="setHold"></div>
          <div class="form-group"><label class="form-label">AI screening fee (₦)</label><input class="form-input" type="number" value="${s?.ai_screening_fee ?? 2000}" id="setAiFee"></div>
          <button class="btn btn-gold" style="margin-top:16px" onclick="saveCommissions()">Save Commissions</button>
        </div></div>
      </div>

      <div class="card" style="margin-top:24px"><div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:center"><h3>Subscription Plans</h3><button class="btn btn-outline btn-sm" onclick="showAddPlan()">+ Add Plan</button></div>
        <div id="planForm" style="display:none;margin:16px 0;padding:16px;background:var(--bg);border-radius:var(--radius)">
          <div class="form-row">
            <div class="form-group"><label class="form-label">Key (unique, no spaces)</label><input class="form-input" id="pKey"></div>
            <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="pName"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Price (₦)</label><input class="form-input" type="number" id="pPrice"></div>
            <div class="form-group"><label class="form-label">Duration (days)</label><input class="form-input" type="number" id="pDuration" value="30"></div>
          </div>
          <div class="form-group"><label class="form-label">Badge label</label><input class="form-input" id="pBadge"></div>
          <div class="form-group"><label class="form-label">Benefits (comma-separated)</label><input class="form-input" id="pBenefits"></div>
          <div class="form-group"><label class="form-label">Search priority boost (0-100)</label><input class="form-input" type="number" id="pBoost" value="0"></div>
          <button class="btn btn-gold btn-sm" onclick="savePlan()">Save Plan</button>
        </div>
        <table class="admin-table">
          <thead><tr><th>Plan</th><th>Price</th><th>Duration</th><th>Boost</th><th>Status</th><th></th></tr></thead>
          <tbody>${plans.map(p => `<tr>
            <td>${p.name} ${p.badge ? `<span class="badge badge-elite">${p.badge}</span>` : ''}</td>
            <td>${fmtPrice(p.price)}</td><td>${p.duration_days}d</td><td>${p.priority_boost}</td>
            <td>${p.is_active ? 'Active' : 'Inactive'}</td>
            <td style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-outline btn-sm" onclick="editPlan('${p.id}')">Edit</button>
              ${p.is_active
                ? `<button class="btn btn-outline btn-sm" onclick="setPlanActive('${p.id}', false)">Deactivate</button>`
                : `<button class="btn btn-gold btn-sm" onclick="setPlanActive('${p.id}', true)">Activate</button><button class="btn btn-outline btn-sm" onclick="deletePlan('${p.id}')">Delete</button>`}
            </td>
          </tr>`).join('')}</tbody>
        </table>
      </div></div>`;
  }
  window.saveGeneral = async () => {
    const logoFile = document.getElementById('setLogoFile').files[0];
    const faviconFile = document.getElementById('setFaviconFile').files[0];
    const logo_url = logoFile ? await Upload.file(logoFile) : document.getElementById('setLogo').value;
    const favicon_url = faviconFile ? await Upload.file(faviconFile) : document.getElementById('setFavicon').value;
    await API.put('/admin/settings', {
      site_name: document.getElementById('setSiteName').value,
      logo_url, favicon_url,
      default_currency: document.getElementById('setCurrency').value,
      default_timezone: document.getElementById('setTz').value,
      maintenance_mode: document.getElementById('setMaint').checked,
      registrations_enabled: document.getElementById('setReg').checked,
      guest_browsing_enabled: document.getElementById('setGuest').checked
    });
    Toast.show('General settings saved');
  };
  window.saveCommissions = async () => {
    await API.put('/admin/settings', {
      commission_freelancer: +document.getElementById('setCommFree').value,
      commission_worker: +document.getElementById('setCommWorker').value,
      commission_seller: +document.getElementById('setCommSeller').value,
      service_fee_percent: +document.getElementById('setFee').value,
      escrow_hold_hours: +document.getElementById('setHold').value,
      ai_screening_fee: +document.getElementById('setAiFee').value
    });
    Toast.show('Commission & escrow settings saved');
  };
  window.showAddPlan = () => {
    document.getElementById('planForm').style.display = 'block';
    document.getElementById('planForm').dataset.editId = '';
    ['pKey', 'pName', 'pPrice', 'pBadge', 'pBenefits'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('pDuration').value = 30;
    document.getElementById('pBoost').value = 0;
  };
  window.savePlan = async () => {
    try {
      const payload = {
        tier_key: document.getElementById('pKey').value.trim().toLowerCase().replace(/\s+/g, '_'),
        name: document.getElementById('pName').value,
        price: +document.getElementById('pPrice').value,
        duration_days: +document.getElementById('pDuration').value || 30,
        badge: document.getElementById('pBadge').value || null,
        benefits: document.getElementById('pBenefits').value.split(',').map(s => s.trim()).filter(Boolean),
        priority_boost: +document.getElementById('pBoost').value || 0
      };
      const id = document.getElementById('planForm').dataset.editId;
      if (id) await API.put(`/admin/plans/${id}`, payload);
      else await API.post('/admin/plans', payload);
      Toast.show(id ? 'Plan updated' : 'Plan created');
      loadSettings();
    } catch (e) { Toast.show(e.message); }
  };
  window.setPlanActive = async (id, is_active) => {
    await API.put(`/admin/plans/${id}`, { is_active });
    Toast.show(is_active ? 'Plan activated' : 'Plan deactivated');
    loadSettings();
  };
  window.editPlan = async (id) => {
    const plan = await API.get('/admin/plans').then(rows => rows.find(p => p.id === id));
    if (!plan) return Toast.show('Plan not found');
    document.getElementById('planForm').style.display = 'block';
    document.getElementById('planForm').dataset.editId = id;
    document.getElementById('pKey').value = plan.tier_key;
    document.getElementById('pName').value = plan.name;
    document.getElementById('pPrice').value = plan.price;
    document.getElementById('pDuration').value = plan.duration_days;
    document.getElementById('pBadge').value = plan.badge || '';
    document.getElementById('pBenefits').value = (plan.benefits || []).join(', ');
    document.getElementById('pBoost').value = plan.priority_boost || 0;
  };
  window.deletePlan = async (id) => {
    if (!confirm('Delete this inactive plan? This cannot be undone.')) return;
    await API.del(`/admin/plans/${id}`);
    Toast.show('Plan deleted');
    loadSettings();
  };

  // Reusable reason-prompt modal — used by every reject/suspend/pause/discontinue action
  window.promptReason = (title, onConfirm) => {
    const existing = document.getElementById('reasonModalOverlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'reasonModalOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div class="card" style="max-width:440px;width:100%"><div class="card-body">
        <h3>${title}</h3>
        <p style="color:var(--text-muted);font-size:0.85rem;margin-top:4px">This reason is sent to the user in their notification.</p>
        <div class="form-group" style="margin-top:12px"><textarea class="form-textarea" id="reasonModalInput" rows="4" placeholder="Explain why..." autofocus></textarea></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
          <button class="btn btn-outline btn-sm" id="reasonModalCancel">Cancel</button>
          <button class="btn btn-gold btn-sm" id="reasonModalConfirm">Confirm</button>
        </div>
      </div></div>`;
    document.body.appendChild(overlay);
    document.getElementById('reasonModalCancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('reasonModalConfirm').addEventListener('click', () => {
      const reason = document.getElementById('reasonModalInput').value.trim();
      overlay.remove();
      onConfirm(reason);
    });
  };

  const BUILDER_FEATURES = [['homepage','Homepage'],['hire','Hire marketplace'],['shop','Shop marketplace'],['jobs','Jobs'],['recruitment','Recruitment'],['chat','Chat'],['payments','Payments'],['agreements','Agreements'],['blog','Blog'],['support','Support'],['profile_edit','Profile editing']];
  async function loadBuilder() {
    const [features, roles] = await Promise.all([API.get('/admin/builder/features'), API.get('/admin/builder/roles')]);
    const featureMap = new Map(features.map(f => [f.feature_key, f]));
    document.getElementById('adminMain').innerHTML = `<h1 class="section-title">Site Builder & Roles</h1><p class="section-sub">Enable pages and features, then maintain custom role permissions.</p><div class="card" style="margin-top:20px"><div class="card-body"><h3>Pages and features</h3>${BUILDER_FEATURES.map(([key,label]) => `<label style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)"><span>${label}</span><input type="checkbox" class="builder-feature" data-key="${key}" ${featureMap.get(key)?.enabled !== false ? 'checked' : ''}></label>`).join('')}<button class="btn btn-gold btn-sm" style="margin-top:12px" onclick="saveBuilderFeatures()">Save feature access</button></div></div><div class="card" style="margin-top:20px"><div class="card-body"><h3>Recruitment plan rules</h3><p style="color:var(--text-muted);font-size:.9rem">Choose the plans that require an immediate timed interview. This configuration controls the live application workflow.</p><textarea class="form-textarea" id="recruitmentPlanRules" rows="6">${JSON.stringify(featureMap.get('recruitment')?.configuration?.plans || { premium: { interview: true, minutes: 30 }, enterprise: { interview: true, minutes: 30 } }, null, 2)}</textarea><button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="saveRecruitmentRules()">Save plan rules</button></div></div><div class="card" style="margin-top:20px"><div class="card-body"><h3>Custom roles</h3><div class="form-row"><div class="form-group"><label class="form-label">Role key</label><input class="form-input" id="builderRoleKey" placeholder="moderator"></div><div class="form-group"><label class="form-label">Role name</label><input class="form-input" id="builderRoleName" placeholder="Moderator"></div></div><div class="form-group"><label class="form-label">Description</label><input class="form-input" id="builderRoleDescription"></div><div class="form-group"><label class="form-label">Permissions (comma-separated)</label><input class="form-input" id="builderRolePermissions" placeholder="post_jobs, manage_content"></div><button class="btn btn-gold btn-sm" onclick="createBuilderRole()">Add role</button><div style="margin-top:16px">${roles.map(r => `<div class="card" style="padding:12px;margin-top:8px"><strong>${r.name}</strong> <span style="color:var(--text-muted)">${r.role_key}</span><p style="font-size:.9rem;color:var(--text-soft)">${r.description || ''}</p><p style="font-size:.82rem;color:var(--text-muted)">${(r.permissions || []).join(', ') || 'No permissions'}</p>${!r.is_system ? `<button class="btn btn-outline btn-sm" onclick="deleteBuilderRole('${r.id}')">Delete</button>` : ''}</div>`).join('') || '<p style="color:var(--text-muted)">No custom roles yet.</p>'}</div></div></div>`;
  }
  window.saveBuilderFeatures = async () => { try { await Promise.all(Array.from(document.querySelectorAll('.builder-feature')).map(el => API.put(`/admin/builder/features/${el.dataset.key}`, { enabled: el.checked }))); Toast.show('Site feature access saved'); } catch (e) { Toast.show(e.message); } };
  window.saveRecruitmentRules = async () => {
    try {
      const plans = JSON.parse(document.getElementById('recruitmentPlanRules').value);
      await API.put('/admin/builder/features/recruitment', { enabled: document.querySelector('.builder-feature[data-key="recruitment"]')?.checked !== false, configuration: { plans } });
      Toast.show('Recruitment plan rules saved');
    } catch (e) { Toast.show(e instanceof SyntaxError ? 'Plan rules must be valid JSON.' : e.message); }
  };
  window.createBuilderRole = async () => { try { await API.post('/admin/builder/roles', { role_key: document.getElementById('builderRoleKey').value.trim().toLowerCase().replace(/\s+/g, '_'), name: document.getElementById('builderRoleName').value.trim(), description: document.getElementById('builderRoleDescription').value.trim(), permissions: document.getElementById('builderRolePermissions').value.split(',').map(x => x.trim()).filter(Boolean) }); Toast.show('Role created'); load('builder'); } catch (e) { Toast.show(e.message); } };
  window.deleteBuilderRole = async id => { if (!confirm('Delete this custom role?')) return; try { await API.del(`/admin/builder/roles/${id}`); load('builder'); } catch (e) { Toast.show(e.message); } };
  async function loadAgreements() {
    const [rows, archives] = await Promise.all([API.get('/agreements/admin'), API.get('/agreements/admin/archives')]);
    document.getElementById('adminMain').innerHTML = `<h1 class="section-title">Agreement Management</h1><p class="section-sub">Review submitted agreements, track acceptance, completion, and monthly archive records.</p><div class="card" style="margin-top:20px"><div class="card-body">${rows.length ? rows.map(a => `<div style="padding:14px 0;border-bottom:1px solid var(--border)"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><strong>${a.title}</strong><br><span style="font-size:.85rem;color:var(--text-muted)">${a.agreement_number} · ${a.status.replaceAll('_',' ')} · ${fmtPrice(a.price)}</span><p style="font-size:.85rem;color:var(--text-soft)">${a.admin_notes || ''}</p></div><div style="display:flex;gap:6px;align-items:start;flex-wrap:wrap"><button class="btn btn-outline btn-sm" onclick="downloadAdminAgreementPdf('${a.id}','${a.agreement_number}')">PDF</button>${['submitted','under_review'].includes(a.status) ? `<button class="btn btn-gold btn-sm" onclick="reviewAgreement('${a.id}','approve')">Approve & send</button><button class="btn btn-outline btn-sm" onclick="reviewAgreement('${a.id}','request_changes')">Request changes</button><button class="btn btn-outline btn-sm" onclick="reviewAgreement('${a.id}','reject')">Reject</button>` : ''}</div></div></div>`).join('') : '<p style="color:var(--text-muted)">No agreements waiting for review.</p>'}</div></div><div class="card" style="margin-top:20px"><div class="card-body"><h3>Monthly archives</h3><div class="form-row"><input class="form-input" type="month" id="archiveMonth"><button class="btn btn-outline" onclick="createAgreementArchive()">Create / refresh archive record</button><button class="btn btn-gold" onclick="downloadAgreementArchive()">Download ZIP</button></div>${archives.map(a => `<p>${a.archive_month}: ${a.agreement_count} completed agreements — ${new Date(a.created_at).toLocaleString()}</p>`).join('') || '<p style="color:var(--text-muted)">No archive records yet.</p>'}</div></div>`;
  }
  window.reviewAgreement = async (id, action) => { const note = prompt(action === 'approve' ? 'Optional administrator note:' : 'Reason / requested changes:') || ''; try { await API.put(`/agreements/${id}/review`, { action, note }); Toast.show('Agreement updated'); load('agreements'); } catch(e) { Toast.show(e.message); } };
  window.createAgreementArchive = async () => { const m = document.getElementById('archiveMonth').value; if (!m) return Toast.show('Choose a month'); try { const result = await API.post(`/agreements/admin/archives/${m}`, {}); Toast.show(`Archive record saved (${result.agreements.length} agreements)`); load('agreements'); } catch(e) { Toast.show(e.message); } };
  window.downloadAdminAgreementPdf = async (id, name) => { try { const r = await fetch(`/api/agreements/${id}/pdf`, { headers: { Authorization: `Bearer ${Auth.getToken()}` } }); if (!r.ok) throw new Error((await r.json()).error || 'PDF download failed'); const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = `${name || 'agreement'}.pdf`; a.click(); URL.revokeObjectURL(url); } catch(e) { Toast.show(e.message); } };
  window.downloadAgreementArchive = async () => { const m = document.getElementById('archiveMonth').value; if (!m) return Toast.show('Choose a month'); try { const r = await fetch(`/api/agreements/admin/archives/${m}/download`, { headers: { Authorization: `Bearer ${Auth.getToken()}` } }); if (!r.ok) throw new Error((await r.json()).error || 'Archive download failed'); const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = `AGREEMENTS-${m}.zip`; a.click(); URL.revokeObjectURL(url); } catch(e) { Toast.show(e.message); } };
  load('overview');
});
