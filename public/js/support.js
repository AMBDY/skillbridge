document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { Toast.show('Please sign in to contact support'); setTimeout(() => location.href = '/signin.html', 1000); return; }

  async function loadTickets() {
    const tickets = await API.get('/support/tickets/mine').catch(() => []);
    document.getElementById('ticketList').innerHTML = tickets.length ? tickets.map(t => `
      <div class="card" style="margin-bottom:10px;cursor:pointer" onclick="openTicket('${t.id}')"><div class="card-body" style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>${t.subject}</strong><div class="card-meta">${new Date(t.created_at).toLocaleDateString()}</div></div>
        <span class="badge badge-kyc">${t.status}</span>
      </div></div>`).join('') : '<p style="color:var(--text-muted)">No tickets yet.</p>';
  }

  window.openTicket = async (id) => {
    const { ticket, messages } = await API.get(`/support/tickets/${id}`);
    document.getElementById('ticketThread').innerHTML = `
      <div class="card"><div class="card-body">
        <h3>${ticket.subject} <span class="badge badge-kyc">${ticket.status}</span></h3>
        <div id="threadMessages" style="margin:12px 0;display:flex;flex-direction:column;gap:10px">
          ${messages.map(m => `<div style="background:${m.sender_id === ticket.user_id ? 'var(--bg-elev)' : 'var(--surface-alt, #f0e6d6)'};padding:10px 14px;border-radius:10px">
            <div style="font-size:0.8rem;color:var(--text-muted)">${new Date(m.created_at).toLocaleString()}</div>
            <div>${m.body}</div>
          </div>`).join('')}
        </div>
        ${ticket.status !== 'closed' ? `
          <form id="replyForm">
            <div class="form-group"><textarea class="form-textarea" id="replyBody" rows="3" placeholder="Type a reply..." required></textarea></div>
            <button type="submit" class="btn btn-gold btn-sm">Send Reply</button>
          </form>` : '<p style="color:var(--text-muted)">This ticket is closed.</p>'}
      </div></div>`;
    const form = document.getElementById('replyForm');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = document.getElementById('replyBody').value.trim();
      if (!body) return;
      try { await API.post(`/support/tickets/${id}/messages`, { body }); openTicket(id); }
      catch (err) { Toast.show(err.message); }
    });
  };

  document.getElementById('newTicketForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await API.post('/support/tickets', data);
      Toast.show('Ticket submitted!');
      e.target.reset();
      loadTickets();
    } catch (err) { Toast.show(err.message); }
  });

  loadTickets();
});
