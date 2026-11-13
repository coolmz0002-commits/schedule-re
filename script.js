const $ = id => document.getElementById(id);
let tasks = [], filter = 'all', ringing = null;
const KEY = 'zaid-schedule-v1';

// Load saved tasks
try { tasks = JSON.parse(localStorage.getItem(KEY) || '[]') } catch (e) { tasks = [] }
function save() { try { localStorage.setItem(KEY, JSON.stringify(tasks)) } catch (e) {} }

// Helpers
function pad(n) { return String(n).padStart(2, '0') }
function ymd(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) }
function when(t) { return new Date(t.date + 'T' + t.time) }
function esc(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }
function fmt(t) {
  return when(t).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// Alarm sound
function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [0, .25, .5].forEach(o => {
      const s = a.createOscillator(), g = a.createGain();
      s.connect(g); g.connect(a.destination);
      s.frequency.value = o === .25 ? 988 : 784;
      g.gain.setValueAtTime(.2, a.currentTime + o);
      g.gain.exponentialRampToValueAtTime(.001, a.currentTime + o + .2);
      s.start(a.currentTime + o);
      s.stop(a.currentTime + o + .22);
    });
  } catch (e) {}
}

// Draw the task list and progress ring
function render() {
  const now = new Date(), today = ymd(now);
  let arr = [...tasks].sort((a, b) => when(a) - when(b));
  if (filter === 'today') arr = arr.filter(t => t.date === today);
  if (filter === 'up') arr = arr.filter(t => !t.done && when(t) > now);
  if (filter === 'done') arr = arr.filter(t => t.done);

  $('list').innerHTML = arr.length
    ? arr.map(t => `<div class="item ${t.done ? 'done' : ''}" style="--c:${t.color}" data-id="${t.id}">
        <button class="chk" data-a="chk">${t.done ? '✓' : ''}</button>
        <div class="info">
          <div class="t">${esc(t.title)}</div>
          <div class="m ${!t.done && when(t) < now ? 'late' : ''}">⏰ ${fmt(t)}${!t.done && when(t) < now ? ' · overdue' : ''}</div>
        </div>
        <button class="del" data-a="del" aria-label="Delete">🗑</button>
      </div>`).join('')
    : '<div class="empty"><i>🗓️</i>Nothing here yet. Add a reminder!</div>';

  const done = tasks.filter(t => t.done).length;
  const p = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  $('pct').textContent = p + '%';
  $('fg').style.strokeDashoffset = 226 - 226 * p / 100;
  $('pinfo').textContent = tasks.length ? done + ' of ' + tasks.length + ' completed' : 'No tasks yet';
}

// Add a reminder
$('add').onclick = () => {
  const title = $('title').value.trim(), d = $('d').value, tm = $('tm').value;
  if (!title || !d || !tm) { toast('Please fill title, date and time'); return }
  tasks.push({ id: Date.now(), title, date: d, time: tm, color: $('cat').value, done: false, fired: false });
  save();
  $('title').value = '';
  render();
  toast('Reminder set ✓');
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission() } catch (e) {}
  }
};
$('title').addEventListener('keydown', e => { if (e.key === 'Enter') $('add').click() });

// Tick or delete a task
$('list').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  const el = b.closest('.item'), id = +el.dataset.id;
  if (b.dataset.a === 'chk') {
    const t = tasks.find(x => x.id === id);
    t.done = !t.done; save(); render();
  }
  if (b.dataset.a === 'del') {
    el.classList.add('out');
    setTimeout(() => { tasks = tasks.filter(x => x.id !== id); save(); render() }, 330);
  }
};

// Filter tabs
$('tabs').onclick = e => {
  const b = e.target.closest('.tab'); if (!b) return;
  filter = b.dataset.f;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b));
  render();
};

// Reminder popup
function fire(t) {
  ringing = t; t.fired = true; save();
  $('mt').textContent = t.title;
  $('mm').textContent = 'Scheduled for ' + fmt(t);
  $('modal').classList.add('show');
  beep();
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification('Reminder', { body: t.title });
  } catch (e) {}
}
$('ok').onclick = () => {
  if (ringing) { ringing.done = true; save() }
  $('modal').classList.remove('show'); ringing = null; render();
};
$('snz').onclick = () => {
  if (ringing) {
    const n = new Date(Date.now() + 5 * 60000);
    ringing.date = ymd(n);
    ringing.time = pad(n.getHours()) + ':' + pad(n.getMinutes());
    ringing.fired = false; save();
  }
  $('modal').classList.remove('show'); ringing = null; render();
  toast('Snoozed for 5 minutes');
};

// Runs every second: updates the 12-hour clock and checks for due reminders
function tick() {
  const n = new Date();
  $('time').textContent = pad(n.getHours() % 12 || 12) + ':' + pad(n.getMinutes()) + ':' + pad(n.getSeconds()) + ' ' + (n.getHours() < 12 ? 'AM' : 'PM');
  $('date').textContent = n.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  const h = n.getHours();
  $('greet').textContent = (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + ', Zaid! Plan your day, never miss a thing.';
  if (!ringing) {
    const due = tasks.find(t => !t.done && !t.fired && when(t) <= n && n - when(t) < 3600000);
    if (due) { fire(due); render() }
  }
  if (n.getSeconds() === 0) render();
}

// Default date and time in the form
const now = new Date();
$('d').value = ymd(now);
$('tm').value = pad(now.getHours()) + ':' + pad((now.getMinutes() + 1) % 60);

// Light / dark theme toggle
$('theme').onclick = () => {
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
  r.dataset.theme = dark ? 'light' : 'dark';
  $('theme').textContent = dark ? '🌙' : '☀️';
};

render(); tick(); setInterval(tick, 1000);