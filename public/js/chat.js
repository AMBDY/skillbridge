document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) { location.href = '/signin.html'; return; }
  renderAdSlot('#adSlotChat', 'chat');
  const user = Auth.user();
  const socket = io({ auth: { token: Auth.getToken() } });
  socket.emit('join', user.user_id);

  const convList = document.getElementById('convList');
  const chatMain = document.getElementById('chatMain');
  let activeConv = null;
  let activeOther = null;

  const conversations = await API.get('/chat/conversations').catch(() => []);
  renderConvList(conversations);

  // Auto-open conversation with ?to= param
  const to = new URLSearchParams(location.search).get('to');
  if (to && !conversations.length) {
    try {
      const conv = await API.post('/chat/conversations', { other_user_id: to });
      conversations.unshift(conv);
      renderConvList(conversations);
      openConv(conv);
    } catch (e) { Toast.show(e.message); }
  } else if (conversations.length) {
    openConv(conversations[0]);
  }

  function renderConvList(list) {
    convList.innerHTML = list.length ? list.map(c => {
      const other = c.user_a?.user_id === user.user_id ? c.user_b : c.user_a;
      const name = other?.display_name || 'User';
      return `<div class="chat-list-item" data-id="${c.id}" data-other="${other?.user_id || ''}">
        <img src="${other?.profile_image || 'https://images.pexels.com/photos/3777943/pexels-photo-3777943.jpeg'}" style="width:40px;height:40px;border-radius:50%;object-fit:cover">
        <div><div style="font-weight:500">${name}</div><div style="font-size:0.8rem;color:var(--text-muted)">Tap to open</div></div>
      </div>`;
    }).join('') : '<div style="padding:24px;color:var(--text-muted);text-align:center">No conversations yet</div>';
    convList.querySelectorAll('.chat-list-item').forEach(el => {
      el.addEventListener('click', () => {
        const conv = list.find(c => c.id === el.dataset.id);
        openConv(conv);
      });
    });
  }

  async function openConv(conv) {
    activeConv = conv.id;
    const other = conv.user_a?.user_id === user.user_id ? conv.user_b : conv.user_a;
    activeOther = other?.user_id;
    socket.emit('join_conversation', conv.id);
    document.querySelectorAll('.chat-list-item').forEach(el => el.classList.toggle('active', el.dataset.id === conv.id));

    chatMain.innerHTML = `
      <div class="chat-header">
        <img src="${other?.profile_image || 'https://images.pexels.com/photos/3777943/pexels-photo-3777943.jpeg'}" style="width:40px;height:40px;border-radius:50%;object-fit:cover">
        <div style="flex:1"><div style="font-weight:500">${other?.display_name || 'User'}</div><div style="font-size:0.78rem;color:var(--text-muted)" id="onlineStatus">● online</div></div>
        <select class="form-select" id="translateLang" style="width:auto;padding:6px 8px;font-size:0.82rem" title="Translate messages to...">
          <option value="">No translation</option>
          <option value="fr">French</option><option value="es">Spanish</option><option value="pt">Portuguese</option>
          <option value="ar">Arabic</option><option value="zh">Chinese</option><option value="hi">Hindi</option>
          <option value="ja">Japanese</option><option value="ko">Korean</option><option value="de">German</option>
          <option value="it">Italian</option><option value="ru">Russian</option><option value="tr">Turkish</option>
          <option value="yo">Yoruba</option><option value="ha">Hausa</option><option value="ig">Igbo</option>
        </select>
        <div style="display:flex;gap:6px">
          <button class="btn btn-outline btn-sm" id="acceptBtn">Accept</button>
          <button class="btn btn-outline btn-sm" id="rejectBtn">Reject</button>
          <button class="btn btn-outline btn-sm" id="counterBtn">Counter</button>
          <button class="btn btn-gold btn-sm" id="agreementBtn">Agreement</button>
        </div>
      </div>
      <div class="chat-messages" id="messages"></div>
      <div class="typing-indicator" id="typing" style="display:none">typing...</div>
      <div class="chat-input">
        <button class="icon-btn" id="emojiBtn">😊</button>
        <button class="icon-btn" id="attachBtn">📎</button>
        <button class="icon-btn" id="voiceBtn" title="Record voice note">🎤</button>
        <input class="form-input" id="msgInput" placeholder="Type a message...">
        <button class="btn btn-gold" id="sendBtn">Send</button>
      </div>`;

    const messages = await API.get(`/chat/conversations/${conv.id}/messages`).catch(() => []);
    const msgEl = document.getElementById('messages');
    msgEl.innerHTML = messages.map(m => renderMsg(m, user.user_id)).join('');
    msgEl.scrollTop = msgEl.scrollHeight;

    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('msgInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
    document.getElementById('msgInput').addEventListener('input', () => {
      socket.emit('typing', { conversationId: conv.id, userId: user.user_id, isTyping: true });
      clearTimeout(window._tt); window._tt = setTimeout(() => socket.emit('typing', { conversationId: conv.id, userId: user.user_id, isTyping: false }), 1500);
    });
    document.getElementById('attachBtn').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*,.pdf,.doc,.docx';
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        Toast.show('Uploading...');
        try {
          const url = await Upload.file(file);
          const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
          socket.emit('message', { conversation_id: conv.id, sender_id: user.user_id, body: '', message_type: type, file_url: url });
        } catch (e) { Toast.show(e.message); }
      };
      input.click();
    });
    document.getElementById('emojiBtn').addEventListener('click', () => {
      const input = document.getElementById('msgInput');
      input.value += '😊'; input.focus();
    });
    let mediaRecorder = null, recordedChunks = [];
    const voiceBtn = document.getElementById('voiceBtn');
    voiceBtn.addEventListener('click', async () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          voiceBtn.textContent = '🎤';
          const blob = new Blob(recordedChunks, { type: 'audio/webm' });
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
          Toast.show('Uploading voice note...');
          try {
            const url = await Upload.file(file);
            socket.emit('message', { conversation_id: conv.id, sender_id: user.user_id, body: '', message_type: 'voice', file_url: url });
          } catch (e) { Toast.show(e.message); }
        };
        mediaRecorder.start();
        voiceBtn.textContent = '⏹';
        Toast.show('Recording... click again to stop');
      } catch (e) { Toast.show('Microphone access denied'); }
    });
    document.getElementById('acceptBtn').addEventListener('click', () => {
      socket.emit('message', { conversation_id: activeConv, sender_id: user.user_id, body: '✅ Offer accepted — the "Received" button activates 1 hour after this.', message_type: 'text' });
      Toast.show('Offer accepted');
    });
    document.getElementById('rejectBtn').addEventListener('click', () => {
      socket.emit('message', { conversation_id: activeConv, sender_id: user.user_id, body: '❌ Offer rejected.', message_type: 'text' });
      Toast.show('Offer rejected');
    });
    document.getElementById('counterBtn').addEventListener('click', () => {
      const v = prompt('Counter offer amount (₦):');
      if (!v || isNaN(+v)) return;
      socket.emit('message', { conversation_id: activeConv, sender_id: user.user_id, body: `🔁 Counter offer: ${fmtPrice(+v)}`, message_type: 'text' });
      Toast.show('Counter offer sent');
    });
    document.getElementById('agreementBtn').addEventListener('click', () => location.href = '/agreement.html?conv=' + conv.id + '&worker=' + activeOther);
  }

  function renderMsg(m, myId) {
    const mine = m.sender_id === myId;
    let body = m.body;
    if (m.message_type === 'file' && m.file_url) body = `<a href="${m.file_url}" target="_blank" style="color:inherit">📎 File</a>`;
    if (m.message_type === 'image' && m.file_url) body = `<img src="${m.file_url}" style="max-width:200px;border-radius:8px">`;
    if (m.message_type === 'video' && m.file_url) body = `<video src="${m.file_url}" controls style="max-width:220px;border-radius:8px"></video>`;
    if (m.message_type === 'voice' && m.file_url) body = `<audio src="${m.file_url}" controls style="max-width:220px"></audio>`;
    if (m.message_type === 'contract') body = `📄 Contract: <a href="${m.file_url || '#'}" style="color:inherit">View</a>`;
    if (m.message_type === 'payment_proof') body = `🧾 Payment proof`;
    const translateBtn = m.message_type === 'text' && m.body ? `<button class="msg-translate-btn" data-id="${m.id}" data-original="${encodeURIComponent(m.body)}" style="background:none;border:none;color:inherit;opacity:0.6;font-size:0.75rem;cursor:pointer;padding:0;margin-top:4px">🌐 Translate</button>` : '';
    return `<div class="msg ${mine ? 'mine' : 'theirs'}"><div class="msg-body" data-id="${m.id}">${body}</div>${translateBtn}<div class="msg-meta">${timeAgo(m.created_at)}${mine && m.seen ? ' • seen' : ''}</div></div>`;
  }

  document.getElementById('messages')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.msg-translate-btn');
    if (!btn) return;
    const lang = document.getElementById('translateLang')?.value;
    if (!lang) return Toast.show('Pick a language from the dropdown above first');
    const original = decodeURIComponent(btn.dataset.original);
    const bodyEl = document.querySelector(`.msg-body[data-id="${btn.dataset.id}"]`);
    if (btn.dataset.showing === 'translated') {
      bodyEl.textContent = original;
      btn.dataset.showing = 'original';
      btn.textContent = '🌐 Translate';
      return;
    }
    btn.textContent = 'Translating...';
    try {
      const result = await API.post('/ai/translate', { text: original, target_lang: lang });
      bodyEl.textContent = result.translated;
      btn.dataset.showing = 'translated';
      btn.textContent = '🌐 Show original';
    } catch { btn.textContent = '🌐 Translate'; Toast.show('Translation failed'); }
  });

  function sendMessage() {
    const input = document.getElementById('msgInput');
    const body = input.value.trim();
    if (!body || !activeConv) return;
    socket.emit('message', { conversation_id: activeConv, sender_id: user.user_id, body, message_type: 'text' });
    input.value = '';
  }

  socket.on('message', (msg) => {
    if (msg.conversation_id === activeConv) {
      const el = document.getElementById('messages');
      el.innerHTML += renderMsg(msg, user.user_id);
      el.scrollTop = el.scrollHeight;
      if (msg.sender_id !== user.user_id) socket.emit('seen', { messageId: msg.id, conversationId: activeConv });
    }
  });
  socket.on('typing', ({ userId, isTyping }) => {
    if (userId !== user.user_id) document.getElementById('typing').style.display = isTyping ? 'block' : 'none';
  });
  socket.on('seen', ({ messageId }) => {
    const el = document.querySelector(`[data-msg="${messageId}"]`);
    if (el) el.querySelector('.msg-meta').textContent += ' • seen';
  });
  socket.on('notification', (n) => Toast.show('New ' + n.type));
  socket.on('error', (e) => Toast.show(e.message || 'Connection error'));
});
