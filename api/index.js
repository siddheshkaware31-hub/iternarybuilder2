// api/index.js — Vercel serverless entry point
// Wraps the existing server.js request handler without calling server.listen()

const path = require('path');
const { URL } = require('url');
const fs = require('fs');

// Patch __dirname-relative paths so they resolve from project root
// (Vercel sets cwd to the project root when invoking serverless functions)
const { getDb, save, uid, hashPassword, verifyPassword } = require('../lib/db');
const { setSessionCookie, clearSessionCookie, getSessionIdFromReq } = require('../lib/auth');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function currentUser(req) {
  const db = getDb();
  const sessionId = getSessionIdFromReq(req);
  if (!sessionId) return null;
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  if (session.expiresAt && new Date(session.expiresAt) < new Date()) return null;
  return db.users.find((u) => u.id === session.userId) || null;
}

function publicUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}

function nextDayFor(days, dayNumber) {
  return days.find((d) => d.dayNumber === dayNumber + 1);
}

function ensureProgressRow(db, userId, dayId) {
  let row = db.progress.find((p) => p.userId === userId && p.dayId === dayId);
  if (!row) {
    row = {
      id: uid('p'),
      userId,
      dayId,
      status: 'locked',
      quizAnswers: null,
      quizScore: null,
      roleplayResponse: null,
      trainerScore: null,
      trainerFeedback: null,
      trainerId: null,
      submittedAt: null,
      completedAt: null,
      updatedAt: new Date().toISOString(),
    };
    db.progress.push(row);
  }
  return row;
}

function computeQuizScore(day, answers) {
  if (!Array.isArray(answers) || !answers.length) return 0;
  let correct = 0;
  day.quiz.forEach((q, i) => {
    if (answers[i] === q.correct) correct += 1;
  });
  return Math.round((correct / day.quiz.length) * 100);
}

function teamSummary(db, execs) {
  return execs.map((u) => {
    const rows = db.progress.filter((p) => p.userId === u.id);
    const completed = rows.filter((r) => r.status === 'completed').length;
    const pendingReview = rows.filter((r) => r.status === 'submitted').length;
    const avgTrainerScore = (() => {
      const scored = rows.filter((r) => r.trainerScore != null);
      if (!scored.length) return null;
      return Math.round(scored.reduce((s, r) => s + r.trainerScore, 0) / scored.length);
    })();
    const avgQuizScore = (() => {
      const scored = rows.filter((r) => r.quizScore != null);
      if (!scored.length) return null;
      return Math.round(scored.reduce((s, r) => s + r.quizScore, 0) / scored.length);
    })();
    return {
      user: publicUser(u),
      completedDays: completed,
      totalDays: db.days.length,
      pendingReview,
      avgTrainerScore,
      avgQuizScore,
    };
  });
}

async function handleApi(req, res, pathname, query) {
  const db = getDb();
  const user = currentUser(req);

  // ---- AUTH ----
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    const wantEmail = String(body.email || '').toLowerCase();
    const u = db.users.find((x) => x.email.toLowerCase() === wantEmail);
    if (!u || !verifyPassword(body.password || '', u.password)) {
      return sendJson(res, 401, { error: 'Invalid email or password' });
    }
    const session = { id: uid('s'), userId: u.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() };
    db.sessions.push(session);
    save();
    setSessionCookie(res, session.id);
    return sendJson(res, 200, { user: publicUser(u) });
  }

  // Auto-login as manager — no credentials required (public demo mode)
  if (pathname === '/api/auth/autologin' && req.method === 'POST') {
    const manager = db.users.find((u) => u.role === 'manager');
    if (!manager) return sendJson(res, 500, { error: 'Manager user not seeded' });
    const session = { id: uid('s'), userId: manager.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() };
    db.sessions.push(session);
    save();
    setSessionCookie(res, session.id);
    return sendJson(res, 200, { user: publicUser(manager) });
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const sessionId = getSessionIdFromReq(req);
    if (sessionId) {
      db.sessions = db.sessions.filter((s) => s.id !== sessionId);
      save();
    }
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    if (!user) return sendJson(res, 401, { error: 'Not authenticated' });
    return sendJson(res, 200, { user: publicUser(user) });
  }

  // everything below requires auth
  if (!user) return sendJson(res, 401, { error: 'Not authenticated' });

  // ---- DAYS (curriculum) ----
  if (pathname === '/api/days' && req.method === 'GET') {
    return sendJson(res, 200, { days: db.days });
  }

  if (pathname === '/api/days' && req.method === 'POST') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'Forbidden' });
    const body = await readBody(req);
    const nextNum = db.days.length ? Math.max(...db.days.map((d) => d.dayNumber)) + 1 : 1;
    const day = {
      id: nextNum,
      dayNumber: nextNum,
      week: body.week || Math.ceil(nextNum / 8),
      weekTheme: body.weekTheme || '',
      title: body.title || `Day ${nextNum}`,
      objectives: body.objectives || [],
      material: body.material || '',
      examples: body.examples || '',
      exercises: body.exercises || '',
      roleplayScenario: body.roleplayScenario || '',
      quiz: body.quiz || [],
      updatedAt: new Date().toISOString(),
    };
    db.days.push(day);
    save();
    return sendJson(res, 201, { day });
  }

  const dayMatch = pathname.match(/^\/api\/days\/(\d+)$/);
  if (dayMatch && req.method === 'PUT') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'Forbidden' });
    const id = Number(dayMatch[1]);
    const day = db.days.find((d) => d.id === id);
    if (!day) return sendJson(res, 404, { error: 'Day not found' });
    const body = await readBody(req);
    ['title', 'week', 'weekTheme', 'objectives', 'material', 'examples', 'exercises', 'roleplayScenario', 'quiz'].forEach((k) => {
      if (body[k] !== undefined) day[k] = body[k];
    });
    day.updatedAt = new Date().toISOString();
    save();
    return sendJson(res, 200, { day });
  }

  if (dayMatch && req.method === 'DELETE') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'Forbidden' });
    const id = Number(dayMatch[1]);
    db.days = db.days.filter((d) => d.id !== id);
    db.progress = db.progress.filter((p) => p.dayId !== id);
    save();
    return sendJson(res, 200, { ok: true });
  }

  // ---- USERS ----
  if (pathname === '/api/users' && req.method === 'GET') {
    if (user.role === 'admin') {
      return sendJson(res, 200, { users: db.users.map(publicUser) });
    }
    if (user.role === 'manager') {
      const team = db.users.filter((u) => u.managerId === user.id);
      return sendJson(res, 200, { users: team.map(publicUser) });
    }
    return sendJson(res, 200, { users: [publicUser(user)] });
  }

  if (pathname === '/api/users' && req.method === 'POST') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'Forbidden' });
    const body = await readBody(req);
    if (!body.name || !body.email || !body.role) return sendJson(res, 400, { error: 'name, email, role are required' });
    if (db.users.some((u) => u.email.toLowerCase() === body.email.toLowerCase())) {
      return sendJson(res, 400, { error: 'A user with this email already exists' });
    }
    const newUser = {
      id: uid('u'),
      name: body.name,
      email: body.email,
      password: hashPassword(body.password || 'Velocity@123'),
      role: body.role,
      managerId: body.managerId || null,
      createdAt: new Date().toISOString(),
    };
    db.users.push(newUser);
    if (newUser.role === 'executive') {
      db.days.forEach((day) => {
        ensureProgressRow(db, newUser.id, day.id).status = day.dayNumber === 1 ? 'unlocked' : 'locked';
      });
    }
    save();
    return sendJson(res, 201, { user: publicUser(newUser) });
  }

  const userMatch = pathname.match(/^\/api\/users\/([\w-]+)$/);
  if (userMatch && req.method === 'PUT') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'Forbidden' });
    const target = db.users.find((u) => u.id === userMatch[1]);
    if (!target) return sendJson(res, 404, { error: 'User not found' });
    const body = await readBody(req);
    if (body.name !== undefined) target.name = body.name;
    if (body.role !== undefined) target.role = body.role;
    if (body.managerId !== undefined) target.managerId = body.managerId;
    if (body.password) target.password = hashPassword(body.password);
    save();
    return sendJson(res, 200, { user: publicUser(target) });
  }

  if (userMatch && req.method === 'DELETE') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'Forbidden' });
    db.users = db.users.filter((u) => u.id !== userMatch[1]);
    db.progress = db.progress.filter((p) => p.userId !== userMatch[1]);
    save();
    return sendJson(res, 200, { ok: true });
  }

  // ---- PROGRESS ----
  if (pathname === '/api/progress' && req.method === 'GET') {
    const targetUserId = query.get('userId') || user.id;
    if (targetUserId !== user.id) {
      const target = db.users.find((u) => u.id === targetUserId);
      const allowed = user.role === 'admin' || (user.role === 'manager' && target && target.managerId === user.id);
      if (!allowed) return sendJson(res, 403, { error: 'Forbidden' });
    }
    db.days.forEach((day) => ensureProgressRow(db, targetUserId, day.id));
    save();
    const rows = db.progress.filter((p) => p.userId === targetUserId).sort((a, b) => {
      const da = db.days.find((d) => d.id === a.dayId);
      const dbb = db.days.find((d) => d.id === b.dayId);
      return (da ? da.dayNumber : 0) - (dbb ? dbb.dayNumber : 0);
    });
    return sendJson(res, 200, { progress: rows });
  }

  const startMatch = pathname.match(/^\/api\/progress\/(\d+)\/start$/);
  if (startMatch && req.method === 'POST') {
    if (user.role !== 'executive') return sendJson(res, 403, { error: 'Only executives can start training days' });
    const dayId = Number(startMatch[1]);
    const day = db.days.find((d) => d.id === dayId);
    if (!day) return sendJson(res, 404, { error: 'Day not found' });
    const row = ensureProgressRow(db, user.id, dayId);
    if (row.status === 'locked') return sendJson(res, 403, { error: 'This day is still locked' });
    if (row.status === 'unlocked') row.status = 'in_progress';
    row.updatedAt = new Date().toISOString();
    save();
    return sendJson(res, 200, { progress: row });
  }

  const submitMatch = pathname.match(/^\/api\/progress\/(\d+)\/submit$/);
  if (submitMatch && req.method === 'POST') {
    if (user.role !== 'executive') return sendJson(res, 403, { error: 'Only executives can submit assessments' });
    const dayId = Number(submitMatch[1]);
    const day = db.days.find((d) => d.id === dayId);
    if (!day) return sendJson(res, 404, { error: 'Day not found' });
    const row = ensureProgressRow(db, user.id, dayId);
    if (row.status === 'locked') return sendJson(res, 403, { error: 'This day is still locked' });
    const body = await readBody(req);
    row.quizAnswers = Array.isArray(body.quizAnswers) ? body.quizAnswers : [];
    row.quizScore = computeQuizScore(day, row.quizAnswers);
    row.roleplayResponse = body.roleplayResponse || '';
    row.status = 'submitted';
    row.submittedAt = new Date().toISOString();
    row.updatedAt = new Date().toISOString();
    save();
    return sendJson(res, 200, { progress: row });
  }

  const reviewMatch = pathname.match(/^\/api\/progress\/([\w-]+)\/(\d+)\/review$/);
  if (reviewMatch && req.method === 'POST') {
    if (user.role !== 'manager' && user.role !== 'admin') return sendJson(res, 403, { error: 'Forbidden' });
    const targetUserId = reviewMatch[1];
    const dayId = Number(reviewMatch[2]);
    const target = db.users.find((u) => u.id === targetUserId);
    if (!target) return sendJson(res, 404, { error: 'Employee not found' });
    if (user.role === 'manager' && target.managerId !== user.id) return sendJson(res, 403, { error: 'Not your team member' });
    const day = db.days.find((d) => d.id === dayId);
    if (!day) return sendJson(res, 404, { error: 'Day not found' });
    const row = ensureProgressRow(db, targetUserId, dayId);
    const body = await readBody(req);
    row.trainerScore = typeof body.trainerScore === 'number' ? body.trainerScore : Number(body.trainerScore) || 0;
    row.trainerFeedback = body.trainerFeedback || '';
    row.trainerId = user.id;
    row.status = 'completed';
    row.completedAt = new Date().toISOString();
    row.updatedAt = new Date().toISOString();
    const nd = nextDayFor(db.days, day.dayNumber);
    if (nd) {
      const nextRow = ensureProgressRow(db, targetUserId, nd.id);
      if (nextRow.status === 'locked') nextRow.status = 'unlocked';
    }
    save();
    return sendJson(res, 200, { progress: row });
  }

  const resetMatch = pathname.match(/^\/api\/progress\/([\w-]+)\/(\d+)\/reset$/);
  if (resetMatch && req.method === 'POST') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'Forbidden' });
    const targetUserId = resetMatch[1];
    const dayId = Number(resetMatch[2]);
    const day = db.days.find((d) => d.id === dayId);
    if (!day) return sendJson(res, 404, { error: 'Day not found' });
    const row = ensureProgressRow(db, targetUserId, dayId);
    const prevDay = db.days.find((d) => d.dayNumber === day.dayNumber - 1);
    const prevCompleted = !prevDay || db.progress.find((p) => p.userId === targetUserId && p.dayId === prevDay.id && p.status === 'completed');
    row.status = prevCompleted ? 'unlocked' : 'locked';
    row.quizAnswers = null;
    row.quizScore = null;
    row.roleplayResponse = null;
    row.trainerScore = null;
    row.trainerFeedback = null;
    row.trainerId = null;
    row.submittedAt = null;
    row.completedAt = null;
    row.updatedAt = new Date().toISOString();
    save();
    return sendJson(res, 200, { progress: row });
  }

  // ---- REPORTS ----
  if (pathname === '/api/reports/team' && req.method === 'GET') {
    if (user.role === 'admin') {
      const execs = db.users.filter((u) => u.role === 'executive');
      return sendJson(res, 200, { team: teamSummary(db, execs) });
    }
    if (user.role === 'manager') {
      const execs = db.users.filter((u) => u.managerId === user.id);
      return sendJson(res, 200, { team: teamSummary(db, execs) });
    }
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  if (pathname === '/api/reports/export' && req.method === 'GET') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'Forbidden' });
    const rows = [['Employee', 'Email', 'Manager', 'Day', 'Week', 'Title', 'Status', 'Quiz Score', 'Trainer Score', 'Trainer Feedback', 'Completed At']];
    db.progress.forEach((p) => {
      const u = db.users.find((x) => x.id === p.userId);
      const d = db.days.find((x) => x.id === p.dayId);
      if (!u || !d) return;
      const mgr = db.users.find((x) => x.id === u.managerId);
      rows.push([
        u.name, u.email, mgr ? mgr.name : '', d.dayNumber, d.week, d.title, p.status,
        p.quizScore ?? '', p.trainerScore ?? '', (p.trainerFeedback || '').replace(/\n/g, ' '), p.completedAt || '',
      ]);
    });
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="velocity-academy-report.csv"',
    });
    return res.end(csv);
  }

  return sendJson(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexData) => {
        if (err2) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(indexData);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// Vercel serverless handler — export as default function
module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, url.searchParams);
      return;
    }
    serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Internal server error' });
  }
};
