// app.js - everything on the main (signed-in) page.
// The page is one HTML file with several <section class="view"> blocks; we show one at a time.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  user: null,
  conversations: [],
  activeConvoId: null,
  emotionOptions: [],
  selectedEmotions: new Set(),
  resources: [],
  loaded: {}, // which views have fetched their data
};

// ============================== NAVIGATION ==============================
function showView(name) {
  if (!document.getElementById(`view-${name}`)) name = 'dashboard';
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${name}`));
  $$('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  window.scrollTo(0, 0);

  if (name === 'dashboard') loadDashboard(); // always refresh stats
  if (name === 'chat' && !state.loaded.chat) loadConversations();
  if (name === 'checkin' && !state.loaded.checkin) loadCheckins();
  if (name === 'thoughts' && !state.loaded.thoughts) loadThoughts();
}

$$('.nav button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-view-link]');
  if (link) showView(link.dataset.viewLink);

  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'signout') { e.preventDefault(); signOut(); }
  if (action === 'crisis') openCrisis();
  if (action === 'close-crisis') $('#crisis-modal').classList.add('hidden');
  if (action === 'new-convo') newConversation();
  if (action === 'load-insights') loadInsights();
});

// ============================== INIT ==============================
async function init() {
  try {
    const { user } = await api('/api/auth/me');
    state.user = user;
    const initial = user.username[0];
    $('#avatar').textContent = initial;
    $('#avatar-mobile').textContent = initial;
    $('#username-label').textContent = user.username;
    $('#acct-username').textContent = user.username;
    $('#acct-email').textContent = user.email;
    $('#acct-since').textContent = new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    $('#greeting').textContent = `${part}, ${user.username}`;

    showView(location.hash.slice(1) || 'dashboard');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function signOut() {
  try { await api('/api/auth/signout', { method: 'POST', body: {} }); } catch { /* ignore */ }
  window.location.href = '/';
}

// ============================== CRISIS UI ==============================
const DEFAULT_RESOURCES = [
  { name: '988 Suicide & Crisis Lifeline', detail: 'Call or text 988 (US), 24/7', href: 'tel:988' },
  { name: 'Crisis Text Line', detail: 'Text HOME to 741741', href: 'sms:741741?body=HOME' },
  { name: 'Emergency services', detail: 'Call 911 if you are in immediate danger', href: 'tel:911' },
  { name: 'Outside the US', detail: 'Find a helpline at findahelpline.com', href: 'https://findahelpline.com' },
];

function resourceItems(resources) {
  return (resources?.length ? resources : DEFAULT_RESOURCES)
    .map((r) => `<li><a href="${escapeHtml(r.href)}" target="_blank" rel="noopener">${escapeHtml(r.name)}</a> — ${escapeHtml(r.detail)}</li>`)
    .join('');
}
function openCrisis() {
  $('#crisis-list').innerHTML = resourceItems(state.resources);
  $('#crisis-modal').classList.remove('hidden');
}
function showCrisisBanner(targetSel, resources) {
  $(targetSel).innerHTML = `
    <div class="crisis" role="alert">
      <h3>It sounds like you're going through something really painful.</h3>
      <p class="small" style="margin:0">You deserve support from a real person right now. Please reach out:</p>
      <ul>${resourceItems(resources)}</ul>
    </div>`;
}

// ============================== DASHBOARD ==============================
async function loadDashboard() {
  try {
    const [stats, { checkins }] = await Promise.all([api(`/api/stats?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`), api('/api/checkins?days=30')]);

    $('#stat-mood').textContent = stats.avgMood7d ?? '–';
    const deltaEl = $('#stat-mood-delta');
    if (stats.avgMood7d !== null && stats.avgMoodPrev7d !== null) {
      const diff = +(stats.avgMood7d - stats.avgMoodPrev7d).toFixed(1);
      deltaEl.textContent = diff === 0 ? 'Same as last week' : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} vs last week`;
      deltaEl.className = `delta ${diff > 0 ? 'up' : diff < 0 ? 'down' : 'muted'}`;
    } else {
      deltaEl.textContent = stats.avgMood7d === null ? 'No check-ins this week' : 'First week tracked';
      deltaEl.className = 'delta muted';
    }
    $('#stat-streak').textContent = stats.streak;
    $('#stat-thoughts').textContent = stats.totals.thoughts;
    $('#stat-sessions').textContent = stats.totals.sessions;

    if (stats.topEmotions.length)
      $('#top-emotions').innerHTML = stats.topEmotions.map((e) => `<span class="chip chip-static">${escapeHtml(e.emotion)} · ${e.n}</span>`).join('');
    if (stats.topDistortions.length)
      $('#top-distortions').innerHTML = stats.topDistortions.map((d) => `<span class="chip chip-static" style="background:var(--clay-light);color:#8a4428">${escapeHtml(d.name)} · ${d.n}</span>`).join('');

    $('#greeting-sub').textContent = stats.totals.checkins === 0
      ? "Welcome! Start with a quick check-in so MindEase can get to know you."
      : "Here's how you've been doing.";

    drawMoodChart($('#mood-chart'), checkins);
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ============================== CHAT ==============================
const STARTERS = [
  "I've been feeling really stressed lately",
  "I can't stop overthinking something",
  "I'm having trouble sleeping",
  'I just need to vent',
];

async function loadConversations() {
  try {
    const { conversations } = await api('/api/conversations');
    state.conversations = conversations;
    state.loaded.chat = true;
    renderConvoList();
    if (conversations.length) openConversation(conversations[0].id);
    else renderWelcome();

  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderConvoList() {
  const list = $('#convo-list');
  if (!state.conversations.length) {
    list.innerHTML = '<p class="small muted" style="padding:.5rem">No sessions yet.</p>';
  } else {
    list.innerHTML = state.conversations
      .map((c) => `
        <div class="convo-item ${c.id === state.activeConvoId ? 'active' : ''}" data-id="${c.id}" tabindex="0">
          <span class="t">${escapeHtml(c.title)}</span>
          <button class="del" data-del="${c.id}" aria-label="Delete session" title="Delete">×</button>
        </div>`)
      .join('');
  }
  // Mobile dropdown version
  $('#convo-select').innerHTML = state.conversations.length
    ? state.conversations.map((c) => `<option value="${c.id}" ${c.id === state.activeConvoId ? 'selected' : ''}>${escapeHtml(c.title)}</option>`).join('')
    : '<option>No sessions yet</option>';
}

$('#convo-list').addEventListener('click', async (e) => {
  const delId = e.target.closest('[data-del]')?.dataset.del;
  if (delId) {
    e.stopPropagation();
    if (!confirm('Delete this session? This cannot be undone.')) return;
    try {
      await api(`/api/conversations/${delId}`, { method: 'DELETE' });
      state.conversations = state.conversations.filter((c) => c.id !== +delId);
      if (state.activeConvoId === +delId) {
        state.activeConvoId = null;
        if (state.conversations.length) openConversation(state.conversations[0].id);
        else renderWelcome();
      }
      renderConvoList();
    } catch (err) { toast(err.message, 'error'); }
    return;
  }
  const item = e.target.closest('.convo-item');
  if (item) openConversation(+item.dataset.id);
});
$('#convo-select').addEventListener('change', (e) => openConversation(+e.target.value));

// Shows the empty-chat welcome screen (does not change which session is active).
function renderWelcome() {
  $('#messages').innerHTML = `
    <div class="chat-welcome">
      <h2>How are you, really?</h2>
      <p class="muted">Share whatever's on your mind. MindEase will listen, notice what you're feeling, and suggest a technique when it might help.</p>
      <div class="starter-list">${STARTERS.map((s) => `<button class="chip" data-starter="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}</div>
    </div>`;
}
$('#messages').addEventListener('click', (e) => {
  const s = e.target.closest('[data-starter]');
  if (s) { $('#chat-input').value = s.dataset.starter; $('#chat-input').focus(); }
});

async function newConversation() {
  try {
    const { conversation } = await api('/api/conversations', { method: 'POST', body: {} });
    state.conversations.unshift(conversation);
    state.activeConvoId = conversation.id;
    $('#chat-crisis').innerHTML = '';
    renderConvoList();
    renderWelcome();
    $('#chat-input').focus();
    return conversation.id;
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
}

async function openConversation(id) {
  state.activeConvoId = id;
  $('#chat-crisis').innerHTML = '';
  renderConvoList();
  $('#messages').innerHTML = '<div class="chat-welcome"><div class="spinner"></div></div>';
  try {
    const { messages } = await api(`/api/conversations/${id}/messages`);
    if (!messages.length) return renderWelcome();
    $('#messages').innerHTML = '';
    messages.forEach(appendMessage);
    scrollMessages();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function appendMessage(m) {
  const box = $('#messages');
  box.querySelector('.chat-welcome')?.remove();

  const el = document.createElement('div');
  el.className = `msg ${m.role}`;
  el.innerHTML = formatText(m.content);
  box.appendChild(el);

  // Emotions Gemini detected in the user's message
  if (m.role === 'user' && m.emotions?.length) {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.innerHTML = m.emotions.map((e) => `<span class="chip chip-static">${escapeHtml(e)}</span>`).join('');
    box.appendChild(meta);
  }
  // Optional coping exercise card
  if (m.role === 'model' && m.exercise) {
    const ex = document.createElement('div');
    ex.className = 'exercise';
    ex.innerHTML = `<h4>Try this · ${escapeHtml(m.exercise.name)}</h4><ol>${m.exercise.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`;
    box.appendChild(ex);
  }
  return el;
}
function scrollMessages() { const b = $('#messages'); b.scrollTop = b.scrollHeight; }

// Auto-grow the textarea; Enter sends, Shift+Enter makes a new line.
const chatInput = $('#chat-input');
chatInput.addEventListener('input', () => { chatInput.style.height = 'auto'; chatInput.style.height = `${Math.min(chatInput.scrollHeight, 160)}px`; });
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); }
});

$('#composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = chatInput.value.trim();
  if (!content) return;

  const sendBtn = $('#send-btn');
  sendBtn.disabled = true;
  chatInput.value = '';
  chatInput.style.height = 'auto';

  let id = state.activeConvoId;
  if (!id) id = await newConversation();
  if (!id) { sendBtn.disabled = false; chatInput.value = content; return; }

  // Show the user's message right away + a typing indicator.
  const optimistic = appendMessage({ role: 'user', content });
  const typing = document.createElement('div');
  typing.className = 'typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  $('#messages').appendChild(typing);
  scrollMessages();

  try {
    const data = await api(`/api/conversations/${id}/messages`, { method: 'POST', body: { content } });
    typing.remove();
    optimistic.remove();
    appendMessage(data.userMessage);
    appendMessage(data.modelMessage);
    scrollMessages();

    state.resources = data.resources;
    if (data.showCrisisResources) showCrisisBanner('#chat-crisis', data.resources);

    const convo = state.conversations.find((c) => c.id === id);
    if (convo) {
      convo.title = data.title;
      state.conversations = [convo, ...state.conversations.filter((c) => c.id !== id)];
      renderConvoList();
    }
  } catch (err) {
    // Roll back: remove the message and put the text back so nothing is lost.
    typing.remove();
    optimistic.remove();
    chatInput.value = content;
    toast(err.message, 'error');
  } finally {
    sendBtn.disabled = false;
    chatInput.focus();
  }
});

// ============================== CHECK-IN ==============================
const MOOD_FACES = ['😞', '😞', '😟', '😕', '😐', '🙂', '🙂', '😊', '😄', '🤩'];
const moodColor = (m) => (m <= 3 ? ['#f8e1de', '#b4443a'] : m <= 5 ? ['#f6e4da', '#8a4428'] : m <= 7 ? ['#e3ebf4', '#5b7fa6'] : ['#dfe9e2', '#2e5240']);

$('#mood').addEventListener('input', (e) => { $('#mood-val').textContent = e.target.value; $('#mood-face').textContent = MOOD_FACES[e.target.value - 1]; });
$('#energy').addEventListener('input', (e) => { $('#energy-val').textContent = e.target.value; });
$('#intensity').addEventListener('input', (e) => { $('#intensity-val').textContent = e.target.value; });

async function loadCheckins() {
  try {
    const { checkins, emotionOptions } = await api('/api/checkins?days=90');
    state.loaded.checkin = true;
    state.emotionOptions = emotionOptions;
    $('#emotion-chips').innerHTML = emotionOptions.map((e) => `<button type="button" class="chip" data-emotion="${e}" aria-pressed="false">${e}</button>`).join('');
    renderCheckinHistory(checkins.slice().reverse());
  } catch (err) { toast(err.message, 'error'); }
}

$('#emotion-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-emotion]');
  if (!chip) return;
  const em = chip.dataset.emotion;
  state.selectedEmotions.has(em) ? state.selectedEmotions.delete(em) : state.selectedEmotions.add(em);
  chip.classList.toggle('selected');
  chip.setAttribute('aria-pressed', chip.classList.contains('selected'));
});

function renderCheckinHistory(list) {
  const box = $('#checkin-history');
  if (!list.length) { box.innerHTML = '<div class="empty">No check-ins yet. Your first one takes 30 seconds.</div>'; return; }
  box.innerHTML = list.slice(0, 8).map((c) => {
    const [bg, fg] = moodColor(c.mood);
    const date = new Date(c.created_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return `
      <div class="history-item">
        <div class="mood-badge" style="background:${bg};color:${fg}">${c.mood}</div>
        <div style="flex:1;min-width:0">
          <div class="small muted">${date} · energy ${c.energy}${c.sleep_hours !== null ? ` · ${c.sleep_hours}h sleep` : ''}</div>
          ${c.emotions.length ? `<div class="chip-list" style="margin:.35rem 0">${c.emotions.map((e) => `<span class="chip chip-static" style="font-size:.75rem;padding:.1rem .5rem">${escapeHtml(e)}</span>`).join('')}</div>` : ''}
          ${c.note ? `<div class="small">${escapeHtml(c.note)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

$('#checkin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const data = await api('/api/checkins', {
      method: 'POST',
      body: {
        mood: +$('#mood').value,
        energy: +$('#energy').value,
        sleep_hours: $('#sleep').value === '' ? null : +$('#sleep').value,
        emotions: [...state.selectedEmotions],
        note: $('#note').value.trim(),
      },
    });
    toast('Check-in saved. Nice work showing up for yourself.');
    if (data.showCrisisResources) showCrisisBanner('#checkin-crisis', data.resources);
    // reset form
    $('#note').value = '';
    $('#sleep').value = '';
    state.selectedEmotions.clear();
    $$('#emotion-chips .chip').forEach((c) => { c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false'); });
    const { checkins } = await api('/api/checkins?days=90');
    renderCheckinHistory(checkins.slice().reverse());
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// ============================== THOUGHT RECORDS ==============================
let thoughts = [];

async function loadThoughts() {
  try {
    const data = await api('/api/thoughts');
    thoughts = data.thoughts;
    state.loaded.thoughts = true;
    renderThoughtHistory();
  } catch (err) { toast(err.message, 'error'); }
}

function renderThoughtHistory() {
  const box = $('#thought-history');
  if (!thoughts.length) { box.innerHTML = '<div class="empty">Your completed thought records will show up here.</div>'; return; }
  box.innerHTML = thoughts.map((t) => `
    <div class="card thought-card" data-tid="${t.id}" style="box-shadow:none;padding:1rem" tabindex="0">
      <div class="row">
        <div style="min-width:0">
          <div class="small muted">${new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${escapeHtml(t.emotion)} ${t.intensity_before}% → ${t.analysis.estimated_intensity_after}%</div>
          <div style="font-weight:500;margin-top:.2rem">"${escapeHtml(t.automatic_thought.slice(0, 90))}${t.automatic_thought.length > 90 ? '…' : ''}"</div>
        </div>
        <button class="btn btn-ghost btn-sm" data-tdel="${t.id}" aria-label="Delete record">Delete</button>
      </div>
    </div>`).join('');
}

$('#thought-history').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-tdel]');
  if (del) {
    if (!confirm('Delete this thought record?')) return;
    try {
      await api(`/api/thoughts/${del.dataset.tdel}`, { method: 'DELETE' });
      thoughts = thoughts.filter((t) => t.id !== +del.dataset.tdel);
      renderThoughtHistory();
      $('#thought-result').innerHTML = '';
    } catch (err) { toast(err.message, 'error'); }
    return;
  }
  const card = e.target.closest('[data-tid]');
  if (card) {
    renderThoughtResult(thoughts.find((t) => t.id === +card.dataset.tid));
    $('#thought-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

function renderThoughtResult(t) {
  const a = t.analysis;
  const list = (arr) => (arr.length ? `<ul>${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<p class="muted small">—</p>');
  $('#thought-result').innerHTML = `
    <div class="card" style="margin-top:1.25rem">
      <h3>Your reframe</h3>
      <p class="small muted" style="margin:0">Original thought: "${escapeHtml(t.automatic_thought)}"</p>

      <div class="result-section">
        <h4>Thinking traps spotted</h4>
        ${a.distortions.length
          ? a.distortions.map((d) => `<div class="distortion"><strong>${escapeHtml(d.name)}</strong><div class="small">${escapeHtml(d.explanation)}</div></div>`).join('')
          : '<p class="small muted">No clear thinking traps here — this thought may be a fair reading of the situation.</p>'}
      </div>

      <div class="result-section evidence">
        <div><h4>Evidence for the thought</h4>${list(a.evidence_for)}</div>
        <div><h4>Evidence against it</h4>${list(a.evidence_against)}</div>
      </div>

      <div class="result-section">
        <h4>A more balanced thought</h4>
        <div class="balanced">${escapeHtml(a.balanced_thought)}</div>
      </div>

      <div class="result-section">
        <h4>Questions to sit with</h4>
        ${list(a.reflection_questions)}
      </div>

      <div class="result-section">
        <h4>${escapeHtml(t.emotion)} intensity</h4>
        <div class="intensity-bars">
          <div class="bar-row"><span>Before</span><div class="bar"><span style="width:${t.intensity_before}%;background:var(--clay)"></span></div><strong>${t.intensity_before}%</strong></div>
          <div class="bar-row"><span>Possible</span><div class="bar"><span style="width:${a.estimated_intensity_after}%;background:var(--sage)"></span></div><strong>${a.estimated_intensity_after}%</strong></div>
        </div>
        <p class="hint">"Possible" is an estimate of how it might feel if the balanced thought sinks in.</p>
      </div>
    </div>`;
}

$('#thought-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    situation: $('#situation').value.trim(),
    automatic_thought: $('#auto-thought').value.trim(),
    emotion: $('#t-emotion').value,
    intensity_before: +$('#intensity').value,
  };
  if (!body.situation || !body.automatic_thought) return toast('Please describe the situation and the thought.', 'error');

  const btn = $('#thought-btn');
  btn.disabled = true;
  btn.textContent = 'Analyzing…';
  $('#thought-result').innerHTML = '<div class="card empty" style="margin-top:1.25rem"><div class="spinner"></div>Looking at your thought from a few angles…</div>';
  try {
    const data = await api('/api/thoughts', { method: 'POST', body });
    thoughts.unshift(data.thought);
    renderThoughtHistory();
    renderThoughtResult(data.thought);
    if (data.showCrisisResources) showCrisisBanner('#thought-crisis', data.resources);
    $('#situation').value = '';
    $('#auto-thought').value = '';
  } catch (err) {
    $('#thought-result').innerHTML = '';
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze my thought';
  }
});

// ============================== INSIGHTS ==============================
async function loadInsights() {
  const box = $('#insights-body');
  box.className = 'card empty';
  box.innerHTML = '<div class="spinner"></div>Reading through your last two weeks…';
  try {
    const data = await api('/api/insights');
    if (data.insufficient) {
      box.innerHTML = `<p>${escapeHtml(data.message)}</p><button class="btn btn-primary" data-view-link="checkin">Go to check-in</button>`;
      return;
    }
    const i = data.insights;
    const trendIcon = { improving: '↗', declining: '↘', stable: '→', mixed: '↝' }[i.mood_trend];
    box.className = '';
    box.innerHTML = `
      <div class="card">
        <span class="trend-badge trend-${i.mood_trend}">${trendIcon} Mood ${i.mood_trend}</span>
        <p class="insight-summary">${escapeHtml(i.summary)}</p>
        <p class="small muted" style="margin:0">Based on ${data.basedOn.checkins} check-ins and ${data.basedOn.thoughts} thought records.</p>
      </div>
      <div class="insight-grid">
        <div class="card"><h3>Patterns noticed</h3>${i.patterns.length ? `<ul>${i.patterns.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : '<p class="muted">Nothing clear yet.</p>'}</div>
        <div class="card"><h3>Wins worth noticing</h3>${i.wins.length ? `<ul>${i.wins.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : '<p class="muted">Keep going — wins will show up here.</p>'}</div>
      </div>
      <div class="card" style="margin-top:1.25rem">
        <h3>Try this week</h3>
        ${i.suggestions.map((s) => `<div class="suggestion"><strong>${escapeHtml(s.title)}</strong><div class="small muted">${escapeHtml(s.why)}</div></div>`).join('')}
      </div>`;
  } catch (err) {
    box.className = 'card empty';
    box.innerHTML = `<p>${escapeHtml(err.message)}</p><button class="btn btn-ghost" data-action="load-insights">Try again</button>`;
  }
}

// ============================== ACCOUNT ==============================
$('#delete-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = $('#delete-pw').value;
  if (!password) return toast('Enter your password to confirm.', 'error');
  if (!confirm('This permanently deletes your account and all data. Continue?')) return;
  try {
    await api('/api/auth/account', { method: 'DELETE', body: { password } });
    window.location.href = '/';
  } catch (err) { toast(err.message, 'error'); }
});

init();
