const root = document.getElementById('app');
let STATE = { user: null, days: [], progress: [], team: [], users: [] };

// ---------- helpers ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* csv or empty */ }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function esc(s) { const d = document.createElement('div'); d.innerText = s == null ? '' : String(s); return d.innerHTML; }
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerText = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function initials(name) { return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(); }
function nav(hash) { window.location.hash = hash; }
function statusLabel(s) { return { locked: 'Locked', unlocked: 'Ready to start', in_progress: 'In progress', submitted: 'Awaiting review', completed: 'Completed' }[s] || s; }

// ---------- layout ----------
function layout(activeKey, innerHtml) {
  const u = STATE.user;
  const roleLinks = {
    executive: [['#/dashboard', 'My Training', 'dashboard']],
    manager: [['#/dashboard', 'Team Dashboard', 'dashboard'], ['#/reports', 'Reports', 'reports']],
    admin: [['#/dashboard', 'Overview', 'dashboard'], ['#/admin/curriculum', 'Curriculum', 'curriculum'], ['#/admin/employees', 'Employees', 'employees'], ['#/reports', 'Reports', 'reports']],
  };
  const links = roleLinks[u.role] || [];
  root.innerHTML = `
    <div class="topnav">
      <div class="brand">
        <div class="logo">V</div>
        <div>VELOCITY HOLIDAY SALES ACADEMY<span class="sub">Velocity.travel &middot; Internal Training Platform</span></div>
      </div>
      <nav>${links.map(([href, label, key]) => `<a href="${href}" class="${activeKey === key ? 'active' : ''}">${label}</a>`).join('')}</nav>
      <div class="user">
        <div class="avatar">${initials(u.name)}</div>
        <div>${esc(u.name)}<div class="role-badge" style="margin-top:2px;display:inline-block">${esc(u.role)}</div></div>
        <button class="logout-btn" id="logoutBtn">Log out</button>
      </div>
    </div>
    <main class="container">${innerHtml}</main>
  `;
  document.getElementById('logoutBtn').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    STATE.user = null;
    nav('#/login');
  };
}

// ---------- LOGIN ----------
function renderLogin(error) {
  root.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="brand-row"><div class="logo">V</div><h1>Velocity Holiday Sales Academy</h1></div>
        <p class="tagline">Sign in to continue your training program</p>
        ${error ? `<div class="error-msg">${esc(error)}</div>` : ''}
        <form id="loginForm">
          <div class="form-group"><label>Email</label><input type="email" name="email" required placeholder="[email protected]" /></div>
          <div class="form-group"><label>Password</label><input type="password" name="password" required placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" /></div>
          <button class="btn btn-primary" type="submit">Sign In</button>
        </form>
        <div class="demo-creds">
          <b>Demo accounts</b><br/>
          Admin — [email protected] / Admin@123<br/>
          Manager — [email protected] / Manager@123<br/>
          Executive — [email protected] / Sales@123
        </div>
      </div>
    </div>
  `;
  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      STATE.user = user;
      nav('#/dashboard');
    } catch (err) {
      renderLogin(err.message);
    }
  };
}

// ---------- EXECUTIVE DASHBOARD ----------
async function renderExecutiveDashboard() {
  const { progress } = await api(`/api/progress?userId=${STATE.user.id}`);
  const { days } = await api('/api/days');
  STATE.progress = progress; STATE.days = days;
  const completed = progress.filter((p) => p.status === 'completed').length;
  const pct = Math.round((completed / days.length) * 100);
  const currentDayRow = progress.find((p) => p.status === 'unlocked' || p.status === 'in_progress' || p.status === 'submitted');
  const currentDay = currentDayRow ? days.find((d) => d.id === currentDayRow.dayId) : null;
  const weeks = [1, 2, 3, 4];

  const html = `
    <div class="welcome-banner">
      <div>
        <h1>Welcome back, ${esc(STATE.user.name.split(' ')[0])} 👋</h1>
        <p>30-Day Holiday Sales Training Program &mdash; keep up the momentum.</p>
      </div>
      <div class="progress-pill">
        <div class="big">${completed}/${days.length}</div>
        <div class="small">days completed</div>
      </div>
    </div>

    <div class="grid grid-3" style="margin-bottom:22px">
      <div class="card stat-card"><div class="stat-value">${pct}%</div><div class="stat-label">Program progress</div>
        <div class="progress-track" style="margin-top:10px"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="card stat-card"><div class="stat-value">${avgOf(progress, 'quizScore')}</div><div class="stat-label">Average quiz score</div></div>
      <div class="card stat-card"><div class="stat-value">${avgOf(progress, 'trainerScore')}</div><div class="stat-label">Average trainer score</div></div>
    </div>

    ${currentDay ? `
    <div class="card" style="margin-bottom:22px;border-left:4px solid var(--teal)">
      <div class="flex-between">
        <div>
          <div class="muted" style="font-size:12px;text-transform:uppercase;font-weight:700">Continue where you left off &mdash; Day ${currentDay.dayNumber}</div>
          <h3 style="margin:6px 0 4px">${esc(currentDay.title)}</h3>
          <span class="badge ${currentDayRow.status}">${statusLabel(currentDayRow.status)}</span>
        </div>
        <a class="btn btn-primary" href="#/day/${currentDay.id}">Go to Day ${currentDay.dayNumber} &rarr;</a>
      </div>
    </div>` : ''}

    <div class="section-title">Your 30-Day Program</div>
    ${weeks.map((w) => renderWeekBlock(w, days, progress)).join('')}
  `;
  layout('dashboard', html);
}

function avgOf(rows, field) {
  const scored = rows.filter((r) => r[field] != null);
  if (!scored.length) return '—';
  return Math.round(scored.reduce((s, r) => s + r[field], 0) / scored.length) + '%';
}

function renderWeekBlock(week, days, progress) {
  const wdays = days.filter((d) => d.week === week);
  const theme = wdays[0] ? wdays[0].weekTheme : '';
  return `
    <div style="margin-bottom:22px">
      <div class="muted" style="font-size:13px;font-weight:700;margin-bottom:8px">WEEK ${week} &middot; ${esc(theme)}</div>
      <div class="day-list">
        ${wdays.map((d) => {
          const row = progress.find((p) => p.dayId === d.id) || { status: 'locked' };
          const scoreBit = row.trainerScore != null ? `<span class="muted" style="font-size:12px">Score: ${row.trainerScore}%</span>` : '';
          const actionable = row.status !== 'locked';
          return `
          <div class="day-row ${row.status}">
            <div class="day-num">${row.status === 'completed' ? '✓' : d.dayNumber}</div>
            <div class="day-info">
              <div class="title">${esc(d.title)}</div>
              <div class="meta">Day ${d.dayNumber} &middot; ${scoreBit || '&nbsp;'}</div>
            </div>
            <div class="day-action">
              <span class="badge ${row.status}" style="margin-right:10px">${statusLabel(row.status)}</span>
              ${actionable ? `<a class="btn btn-secondary btn-sm" href="#/day/${d.id}">Open</a>` : `<button class="btn btn-secondary btn-sm" disabled>Locked</button>`}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

// ---------- DAY DETAIL (executive) ----------
async function renderDayDetail(dayId) {
  const [{ days }, { progress }] = await Promise.all([api('/api/days'), api(`/api/progress?userId=${STATE.user.id}`)]);
  const day = days.find((d) => d.id === Number(dayId));
  const row = progress.find((p) => p.dayId === Number(dayId));
  if (!day || !row) { nav('#/dashboard'); return; }

  if (row.status === 'unlocked') {
    try { await api(`/api/progress/${day.id}/start`, { method: 'POST' }); row.status = 'in_progress'; } catch (e) {}
  }

  const readOnly = row.status === 'submitted' || row.status === 'completed';
  const savedAnswers = row.quizAnswers || [];

  const html = `
    <div class="page-header">
      <p><a href="#/dashboard" class="link-btn">&larr; Back to program</a></p>
      <h1>Day ${day.dayNumber}: ${esc(day.title)}</h1>
      <p>Week ${day.week} &middot; ${esc(day.weekTheme)} &middot; <span class="badge ${row.status}">${statusLabel(row.status)}</span></p>
    </div>

    <div class="grid grid-2">
      <div>
        <div class="card">
          <h3>Learning Objectives</h3>
          <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.8">${day.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
        </div>
        <div class="card" style="margin-top:16px">
          <h3>Training Material</h3>
          <div class="material-block">${esc(day.material)}</div>
        </div>
        <div class="card" style="margin-top:16px">
          <h3>Examples</h3>
          <div class="material-block">${esc(day.examples)}</div>
        </div>
        <div class="card" style="margin-top:16px">
          <h3>Exercises</h3>
          <div class="material-block">${esc(day.exercises)}</div>
        </div>
      </div>

      <div>
        <div class="card">
          <h3>Role-Play Scenario</h3>
          <p class="material-block" style="margin-top:0">${esc(day.roleplayScenario)}</p>
          <div class="form-group">
            <label>Your summary / response</label>
            <textarea id="roleplayInput" ${readOnly ? 'disabled' : ''} placeholder="Summarize how you approached the role-play...">${esc(row.roleplayResponse || '')}</textarea>
          </div>
        </div>

        <div class="card" style="margin-top:16px">
          <h3>Assessment Quiz</h3>
          <form id="quizForm">
            ${day.quiz.map((q, qi) => `
              <div class="quiz-q">
                <div class="q-text">${qi + 1}. ${esc(q.q)}</div>
                ${q.options.map((opt, oi) => `
                  <label><input type="radio" name="q${qi}" value="${oi}" ${savedAnswers[qi] === oi ? 'checked' : ''} ${readOnly ? 'disabled' : ''} /> ${esc(opt)}</label>
                `).join('')}
              </div>
            `).join('')}
            ${!readOnly ? `<button class="btn btn-primary" type="submit">Submit Day ${day.dayNumber} Assessment</button>` : `<p class="muted" style="font-size:13px">Submitted${row.submittedAt ? ' on ' + new Date(row.submittedAt).toLocaleDateString() : ''}. Quiz score: <b>${row.quizScore}%</b></p>`}
          </form>
        </div>

        ${row.status === 'completed' ? `
        <div class="card" style="margin-top:16px;border-left:4px solid var(--green)">
          <h3>Trainer Feedback</h3>
          <p style="font-size:26px;font-weight:800;color:var(--navy);margin:0 0 6px">${row.trainerScore}%</p>
          <p class="material-block" style="margin:0">${esc(row.trainerFeedback || 'No written feedback provided.')}</p>
        </div>` : ''}
        ${row.status === 'submitted' ? `<div class="card" style="margin-top:16px"><p class="muted" style="margin:0;font-size:13.5px">Your submission is awaiting review from your trainer/manager.</p></div>` : ''}
      </div>
    </div>
  `;
  layout('dashboard', html);

  if (!readOnly) {
    document.getElementById('quizForm').onsubmit = async (e) => {
      e.preventDefault();
      const answers = day.quiz.map((_, qi) => {
        const val = document.querySelector(`input[name="q${qi}"]:checked`);
        return val ? Number(val.value) : -1;
      });
      const roleplayResponse = document.getElementById('roleplayInput').value;
      try {
        await api(`/api/progress/${day.id}/submit`, { method: 'POST', body: { quizAnswers: answers, roleplayResponse } });
        toast('Assessment submitted for trainer review');
        renderDayDetail(dayId);
      } catch (err) { toast(err.message); }
    };
  }
}

// ---------- MANAGER DASHBOARD ----------
async function renderManagerDashboard() {
  const { team } = await api('/api/reports/team');
  STATE.team = team;
  const totalPending = team.reduce((s, t) => s + t.pendingReview, 0);
  const html = `
    <div class="page-header"><h1>Team Dashboard</h1><p>Welcome back, ${esc(STATE.user.name.split(' ')[0])}. Here's how your team is progressing.</p></div>
    <div class="grid grid-3" style="margin-bottom:22px">
      <div class="card stat-card"><div class="stat-value">${team.length}</div><div class="stat-label">Team members</div></div>
      <div class="card stat-card"><div class="stat-value">${totalPending}</div><div class="stat-label">Pending reviews</div></div>
      <div class="card stat-card"><div class="stat-value">${Math.round(team.reduce((s, t) => s + t.completedDays, 0) / (team.length || 1))}</div><div class="stat-label">Avg. days completed</div></div>
    </div>
    <div class="section-title">Your Team</div>
    <div class="day-list">
      ${team.length ? team.map((t) => `
        <div class="day-row">
          <div class="employee-row" style="flex:1">
            <div class="avatar">${initials(t.user.name)}</div>
            <div class="day-info">
              <div class="title">${esc(t.user.name)}</div>
              <div class="meta">${esc(t.user.email)} &middot; ${t.completedDays}/${t.totalDays} days complete
                ${t.pendingReview ? ` &middot; <span style="color:var(--amber);font-weight:700">${t.pendingReview} awaiting review</span>` : ''}
              </div>
            </div>
          </div>
          <a class="btn btn-secondary btn-sm" href="#/manager/employee/${t.user.id}">View Progress</a>
        </div>
      `).join('') : `<div class="empty-state">No team members assigned yet.</div>`}
    </div>
  `;
  layout('dashboard', html);
}

async function renderManagerEmployee(userId) {
  const [{ progress }, { days }, { users }] = await Promise.all([
    api(`/api/progress?userId=${userId}`), api('/api/days'), api('/api/users'),
  ]);
  const emp = (STATE.team.find((t) => t.user.id === userId) || {}).user || { name: 'Employee' };
  const completed = progress.filter((p) => p.status === 'completed').length;

  const html = `
    <div class="page-header">
      <p><a href="#/dashboard" class="link-btn">&larr; Back to team</a></p>
      <h1>${esc(emp.name)}'s Progress</h1>
      <p>${completed}/${days.length} days completed</p>
    </div>
    <div class="day-list">
      ${[1,2,3,4].map((w) => `
        <div style="margin-bottom:18px">
          <div class="muted" style="font-size:13px;font-weight:700;margin-bottom:8px">WEEK ${w}</div>
          ${days.filter((d) => d.week === w).map((d) => {
            const row = progress.find((p) => p.dayId === d.id) || { status: 'locked' };
            return `
            <div class="day-row ${row.status}" style="margin-bottom:8px">
              <div class="day-num">${row.status === 'completed' ? '✓' : d.dayNumber}</div>
              <div class="day-info">
                <div class="title">${esc(d.title)}</div>
                <div class="meta">${statusLabel(row.status)}${row.quizScore != null ? ` &middot; Quiz: ${row.quizScore}%` : ''}${row.trainerScore != null ? ` &middot; Trainer: ${row.trainerScore}%` : ''}</div>
              </div>
              <div class="day-action">
                ${row.status === 'submitted' ? `<button class="btn btn-primary btn-sm" data-review="${userId}:${d.id}">Review Submission</button>` : ''}
                ${row.status === 'completed' ? `<span class="badge completed">Completed</span>` : ''}
                ${row.status === 'locked' || row.status === 'unlocked' || row.status === 'in_progress' ? `<span class="badge ${row.status}">${statusLabel(row.status)}</span>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      `).join('')}
    </div>
  `;
  layout('dashboard', html);
  root.querySelectorAll('[data-review]').forEach((btn) => {
    btn.onclick = () => {
      const [uid, did] = btn.getAttribute('data-review').split(':');
      openReviewModal(uid, Number(did), days.find((d) => d.id === Number(did)), progress.find((p) => p.dayId === Number(did)), () => renderManagerEmployee(userId));
    };
  });
}

function openReviewModal(userId, dayId, day, row, onDone) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal">
      <button class="close-x">&times;</button>
      <h2>Review: ${esc(day.title)}</h2>
      <div class="card" style="margin-bottom:14px;background:#f8fafc">
        <h3 style="margin-top:0">Role-play submission</h3>
        <p class="material-block" style="margin:0">${esc(row.roleplayResponse || 'No response submitted.')}</p>
      </div>
      <p class="muted" style="font-size:13px">Quiz score (auto-graded): <b>${row.quizScore}%</b></p>
      <form id="reviewForm">
        <div class="form-group"><label>Trainer score (0-100)</label><input type="number" min="0" max="100" name="trainerScore" required class="score-input" /></div>
        <div class="form-group"><label>Trainer feedback</label><textarea name="trainerFeedback" placeholder="Share constructive feedback..." required></textarea></div>
        <button class="btn btn-primary" type="submit">Mark Complete &amp; Save Feedback</button>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.querySelector('.close-x').onclick = () => wrap.remove();
  wrap.onclick = (e) => { if (e.target === wrap) wrap.remove(); };
  wrap.querySelector('#reviewForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api(`/api/progress/${userId}/${dayId}/review`, { method: 'POST', body: { trainerScore: Number(fd.get('trainerScore')), trainerFeedback: fd.get('trainerFeedback') } });
      toast('Feedback saved, day marked complete');
      wrap.remove();
      onDone();
    } catch (err) { toast(err.message); }
  };
}

// ---------- ADMIN: OVERVIEW ----------
async function renderAdminOverview() {
  const [{ team }, { users }] = await Promise.all([api('/api/reports/team'), api('/api/users')]);
  const execCount = users.filter((u) => u.role === 'executive').length;
  const mgrCount = users.filter((u) => u.role === 'manager').length;
  const totalPending = team.reduce((s, t) => s + t.pendingReview, 0);
  const html = `
    <div class="page-header"><h1>Admin Overview</h1><p>Platform-wide snapshot of the Holiday Sales Academy.</p></div>
    <div class="grid grid-4" style="margin-bottom:22px">
      <div class="card stat-card"><div class="stat-value">${execCount}</div><div class="stat-label">Sales executives</div></div>
      <div class="card stat-card"><div class="stat-value">${mgrCount}</div><div class="stat-label">Managers / trainers</div></div>
      <div class="card stat-card"><div class="stat-value">${totalPending}</div><div class="stat-label">Submissions pending review</div></div>
      <div class="card stat-card"><div class="stat-value">${STATE.days.length || 30}</div><div class="stat-label">Curriculum days</div></div>
    </div>
    <div class="section-title">Executive Performance</div>
    <table class="data-table">
      <thead><tr><th>Executive</th><th>Manager</th><th>Progress</th><th>Avg Quiz</th><th>Avg Trainer Score</th><th>Pending</th></tr></thead>
      <tbody>
        ${team.map((t) => {
          const mgr = users.find((u) => u.id === t.user.managerId);
          return `<tr>
            <td>${esc(t.user.name)}</td>
            <td>${mgr ? esc(mgr.name) : '—'}</td>
            <td>${t.completedDays}/${t.totalDays}</td>
            <td>${t.avgQuizScore != null ? t.avgQuizScore + '%' : '—'}</td>
            <td>${t.avgTrainerScore != null ? t.avgTrainerScore + '%' : '—'}</td>
            <td>${t.pendingReview || '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
  layout('dashboard', html);
}

// ---------- ADMIN: CURRICULUM ----------
async function renderAdminCurriculum() {
  const { days } = await api('/api/days');
  STATE.days = days;
  const html = `
    <div class="page-header"><h1>Curriculum Management</h1><p>Edit training content for each of the 30 program days.</p></div>
    <div class="day-list">
      ${[1,2,3,4].map((w) => `
        <div style="margin-bottom:18px">
          <div class="muted" style="font-size:13px;font-weight:700;margin-bottom:8px">WEEK ${w} &middot; ${esc((days.find((d) => d.week === w) || {}).weekTheme || '')}</div>
          ${days.filter((d) => d.week === w).map((d) => `
            <div class="day-row">
              <div class="day-num">${d.dayNumber}</div>
              <div class="day-info"><div class="title">${esc(d.title)}</div><div class="meta">${d.quiz.length} quiz questions</div></div>
              <div class="day-action"><button class="btn btn-secondary btn-sm" data-edit="${d.id}">Edit</button></div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;
  layout('curriculum', html);
  root.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.onclick = () => openDayEditModal(days.find((d) => d.id === Number(btn.getAttribute('data-edit'))));
  });
}

function openDayEditModal(day) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal" style="width:600px">
      <button class="close-x">&times;</button>
      <h2>Edit Day ${day.dayNumber}: ${esc(day.title)}</h2>
      <form id="editForm">
        <div class="form-group"><label>Title</label><input name="title" value="${esc(day.title)}" required /></div>
        <div class="form-group"><label>Learning Objectives (one per line)</label><textarea name="objectives">${esc(day.objectives.join('\n'))}</textarea></div>
        <div class="form-group"><label>Training Material</label><textarea name="material" style="min-height:120px">${esc(day.material)}</textarea></div>
        <div class="form-group"><label>Examples</label><textarea name="examples">${esc(day.examples)}</textarea></div>
        <div class="form-group"><label>Exercises</label><textarea name="exercises">${esc(day.exercises)}</textarea></div>
        <div class="form-group"><label>Role-play Scenario</label><textarea name="roleplayScenario">${esc(day.roleplayScenario)}</textarea></div>
        <p class="muted" style="font-size:12.5px">Quiz questions (${day.quiz.length}) are editable via the API; contact platform admin to change question banks in bulk.</p>
        <button class="btn btn-primary" type="submit">Save Changes</button>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.querySelector('.close-x').onclick = () => wrap.remove();
  wrap.onclick = (e) => { if (e.target === wrap) wrap.remove(); };
  wrap.querySelector('#editForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api(`/api/days/${day.id}`, { method: 'PUT', body: {
        title: fd.get('title'),
        objectives: fd.get('objectives').split('\n').map((s) => s.trim()).filter(Boolean),
        material: fd.get('material'),
        examples: fd.get('examples'),
        exercises: fd.get('exercises'),
        roleplayScenario: fd.get('roleplayScenario'),
      }});
      toast('Day updated');
      wrap.remove();
      renderAdminCurriculum();
    } catch (err) { toast(err.message); }
  };
}

// ---------- ADMIN: EMPLOYEES ----------
async function renderAdminEmployees() {
  const { users } = await api('/api/users');
  STATE.users = users;
  const managers = users.filter((u) => u.role === 'manager');
  const html = `
    <div class="page-header flex-between">
      <div><h1>Employees</h1><p>Manage Holiday Sales team members and their assigned managers.</p></div>
      <button class="btn btn-primary" id="addEmpBtn">+ Add Employee</button>
    </div>
    <table class="data-table">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Manager</th><th>Actions</th></tr></thead>
      <tbody>
        ${users.map((u) => {
          const mgr = users.find((m) => m.id === u.managerId);
          return `<tr>
            <td>${esc(u.name)}</td><td>${esc(u.email)}</td><td style="text-transform:capitalize">${esc(u.role)}</td>
            <td>${mgr ? esc(mgr.name) : '—'}</td>
            <td>${u.role !== 'admin' ? `<button class="btn btn-danger btn-sm" data-del="${u.id}">Remove</button>` : ''}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
  layout('employees', html);
  document.getElementById('addEmpBtn').onclick = () => openAddEmployeeModal(managers);
  root.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Remove this user and all their progress data?')) return;
      await api(`/api/users/${btn.getAttribute('data-del')}`, { method: 'DELETE' });
      renderAdminEmployees();
    };
  });
}

function openAddEmployeeModal(managers) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal">
      <button class="close-x">&times;</button>
      <h2>Add Employee</h2>
      <form id="addForm">
        <div class="form-group"><label>Full name</label><input name="name" required /></div>
        <div class="form-group"><label>Email</label><input type="email" name="email" required /></div>
        <div class="form-group"><label>Temporary password</label><input name="password" value="Velocity@123" required /></div>
        <div class="form-group"><label>Role</label>
          <select name="role" id="roleSelect">
            <option value="executive">Sales Executive</option>
            <option value="manager">Manager / Trainer</option>
          </select>
        </div>
        <div class="form-group" id="managerWrap"><label>Assign manager</label>
          <select name="managerId">
            <option value="">— None —</option>
            ${managers.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" type="submit">Add Employee</button>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.querySelector('.close-x').onclick = () => wrap.remove();
  wrap.onclick = (e) => { if (e.target === wrap) wrap.remove(); };
  wrap.querySelector('#roleSelect').onchange = (e) => {
    document.getElementById('managerWrap').style.display = e.target.value === 'executive' ? 'block' : 'none';
  };
  wrap.querySelector('#addForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/api/users', { method: 'POST', body: {
        name: fd.get('name'), email: fd.get('email'), password: fd.get('password'),
        role: fd.get('role'), managerId: fd.get('managerId') || null,
      }});
      toast('Employee added');
      wrap.remove();
      renderAdminEmployees();
    } catch (err) { toast(err.message); }
  };
}

// ---------- REPORTS (manager + admin) ----------
async function renderReports() {
  const { team } = await api('/api/reports/team');
  const html = `
    <div class="page-header flex-between">
      <div><h1>Reports</h1><p>Performance summary across your team.</p></div>
      ${STATE.user.role === 'admin' ? `<a class="btn btn-secondary" href="/api/reports/export">Export CSV</a>` : ''}
    </div>
    <table class="data-table">
      <thead><tr><th>Name</th><th>Email</th><th>Days Completed</th><th>Pending Review</th><th>Avg Quiz</th><th>Avg Trainer Score</th></tr></thead>
      <tbody>
        ${team.map((t) => `<tr>
          <td>${esc(t.user.name)}</td><td>${esc(t.user.email)}</td>
          <td>${t.completedDays}/${t.totalDays}</td>
          <td>${t.pendingReview}</td>
          <td>${t.avgQuizScore != null ? t.avgQuizScore + '%' : '—'}</td>
          <td>${t.avgTrainerScore != null ? t.avgTrainerScore + '%' : '—'}</td>
        </tr>`).join('') || `<tr><td colspan="6" class="empty-state">No data yet.</td></tr>`}
      </tbody>
    </table>
  `;
  layout('reports', html);
}

// ---------- ROUTER ----------
async function router() {
  const hash = window.location.hash || '#/login';
  if (!STATE.user && hash !== '#/login') {
    try { const { user } = await api('/api/auth/me'); STATE.user = user; } catch (e) { nav('#/login'); return; }
  }
  if (hash === '#/login') {
    if (STATE.user) { nav('#/dashboard'); return; }
    return renderLogin();
  }
  if (!STATE.user) { nav('#/login'); return; }

  const dayMatch = hash.match(/^#\/day\/(\d+)$/);
  const empMatch = hash.match(/^#\/manager\/employee\/([\w-]+)$/);

  try {
    if (hash === '#/dashboard') {
      if (STATE.user.role === 'executive') return renderExecutiveDashboard();
      if (STATE.user.role === 'manager') return renderManagerDashboard();
      if (STATE.user.role === 'admin') return renderAdminOverview();
    }
    if (dayMatch && STATE.user.role === 'executive') return renderDayDetail(dayMatch[1]);
    if (empMatch && (STATE.user.role === 'manager' || STATE.user.role === 'admin')) return renderManagerEmployee(empMatch[1]);
    if (hash === '#/admin/curriculum' && STATE.user.role === 'admin') return renderAdminCurriculum();
    if (hash === '#/admin/employees' && STATE.user.role === 'admin') return renderAdminEmployees();
    if (hash === '#/reports' && (STATE.user.role === 'admin' || STATE.user.role === 'manager')) return renderReports();
    nav('#/dashboard');
  } catch (err) {
    toast(err.message || 'Something went wrong');
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);

