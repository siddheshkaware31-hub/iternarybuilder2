const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const SCRYPT_KEYLEN = 64;

function computeHash(password, salt) {
  return crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
}

// Self-verifying hash: this environment has occasionally shown pbkdf2Sync produce a
// hash that doesn't re-verify against a fresh computation with the same inputs when
// many calls run back-to-back (seen during seeding), so hashing uses scryptSync
// instead (confirmed stable under the same call pattern). Every generated hash is
// still immediately re-checked before it's ever stored, as a safety net.
function hashPassword(password, salt) {
  const fixedSalt = !!salt;
  for (let attempt = 0; attempt < 8; attempt++) {
    const useSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = computeHash(password, useSalt);
    const recheck = computeHash(password, useSalt);
    if (hash === recheck) {
      return `${useSalt}:${hash}`;
    }
    if (!fixedSalt) salt = null; // rotate salt on next attempt
  }
  throw new Error('Failed to generate a stable password hash after multiple attempts');
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  // Recompute twice and accept if either agrees with the stored hash, to avoid acting
  // on a one-off bad pbkdf2Sync result (see note in hashPassword above).
  const check1 = computeHash(password, salt);
  if (check1 === hash) return true;
  const check2 = computeHash(password, salt);
  return check2 === hash;
}

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

// ---------- Curriculum builder ----------
const WEEK_THEMES = {
  1: 'Sales Foundation & Travel Knowledge',
  2: 'Objection Handling',
  3: 'Conversion & Follow-up',
  4: 'Advanced Sales + Client Experience',
};

const DAY_TITLES = [
  // Week 1 (1-7)
  { title: 'Welcome to Velocity Holiday Sales Academy & Company Overview', week: 1 },
  { title: 'Holiday Sales Consultant Role & Responsibilities', week: 1 },
  { title: 'Understanding Our Holiday Packages & Product Range', week: 1 },
  { title: 'Domestic Destinations Deep Dive', week: 1 },
  { title: 'International Destinations Deep Dive', week: 1 },
  { title: 'Customer Profiling & Need Identification', week: 1 },
  { title: 'Week 1 Recap & Foundation Assessment', week: 1 },
  // Week 2 (8-14)
  { title: 'Introduction to Objection Handling', week: 2 },
  { title: 'Handling Price Objections', week: 2 },
  { title: 'Handling Trust & Credibility Objections', week: 2 },
  { title: 'Handling Timing & Urgency Objections', week: 2 },
  { title: 'Handling Competitor Comparison Objections', week: 2 },
  { title: 'Managing Difficult or Angry Customers', week: 2 },
  { title: 'Week 2 Recap & Objection Handling Assessment', week: 2 },
  // Week 3 (15-21)
  { title: 'Sales Funnel & Conversion Basics', week: 3 },
  { title: 'Creating Urgency & Closing Techniques', week: 3 },
  { title: 'Follow-up Strategy & Cadence', week: 3 },
  { title: 'Upselling & Cross-selling Holiday Add-ons', week: 3 },
  { title: 'Payment Plans & Booking Process', week: 3 },
  { title: 'CRM & Lead Management Best Practices', week: 3 },
  { title: 'Week 3 Recap & Conversion Assessment', week: 3 },
  // Week 4 (22-30)
  { title: 'Advanced Consultative Selling', week: 4 },
  { title: 'Building Long-term Client Relationships', week: 4 },
  { title: 'Handling Cancellations & Refunds Gracefully', week: 4 },
  { title: 'Managing High-Value / VIP Clients', week: 4 },
  { title: 'Post-Sale Client Experience & Reviews', week: 4 },
  { title: 'Referral Generation Strategies', week: 4 },
  { title: 'Personal Sales Pitch Mastery', week: 4 },
  { title: 'Mock Client Simulation (Full Sales Cycle)', week: 4 },
  { title: 'Final Assessment & Certification', week: 4 },
];

function buildDay(dayNumber, title, week) {
  const isRecap = /Recap|Final Assessment/i.test(title);
  const objectives = [
    `Explain the core concept of "${title}" in your own words.`,
    `Apply the techniques from today's session to a real holiday-sales scenario.`,
    `Demonstrate the skill in a short role-play with your trainer.`,
    isRecap ? `Score at least 70% on the recap assessment.` : `Complete today's exercise and submit it for trainer review.`,
  ];
  const material = `Today's session focuses on "${title}", part of the ${WEEK_THEMES[week]} module (Week ${week}).\n\n` +
    `Key points:\n` +
    `- Why this topic matters for Velocity Holiday Sales consultants and how it impacts conversion and customer satisfaction.\n` +
    `- Step-by-step approach your trainer will walk you through, with real holiday-package examples.\n` +
    `- Common mistakes consultants make around "${title.toLowerCase()}" and how to avoid them.\n` +
    `- How this connects to what you learned in previous sessions and what comes next.\n\n` +
    `Read through the material carefully, review the examples below, then complete the exercise and role-play before submitting today's assessment.`;
  const examples = `Example 1: A consultant handling a scenario related to "${title.toLowerCase()}" with a domestic holiday package enquiry.\n` +
    `Example 2: The same scenario with an international, higher-value package where stakes and objections are different.\n` +
    `Notice how the consultant listens first, confirms understanding, and only then responds with a tailored solution.`;
  const exercises = `1. Write down 3 real or hypothetical customer situations where today's topic applies.\n` +
    `2. Draft your response/approach for each situation.\n` +
    `3. Identify one thing from your last week that you would now do differently after today's lesson.`;
  const roleplay = `Role-play scenario: You are speaking with a customer relevant to "${title}". Your trainer (or manager) will play the customer. ` +
    `Practice your approach, then type a summary of how you handled it (opening, key points made, how you closed/next steps) for trainer review.`;
  const quiz = [
    {
      q: `What is the primary goal of today's topic — "${title}"?`,
      options: [
        'To close every call within 2 minutes regardless of customer needs',
        'To build genuine understanding and trust while guiding the customer toward the right holiday package',
        'To avoid talking about pricing at all costs',
        'To always escalate to a manager',
      ],
      correct: 1,
    },
    {
      q: `Which approach best reflects good practice for "${title.toLowerCase()}"?`,
      options: [
        'Interrupting the customer to move the pitch along faster',
        'Listening actively, confirming needs, then responding with a relevant, honest solution',
        'Reading a fixed script word-for-word with no adaptation',
        'Promising discounts that are not approved',
      ],
      correct: 1,
    },
    {
      q: `Why is this session (Week ${week}: ${WEEK_THEMES[week]}) important for a Holiday Sales Consultant?`,
      options: [
        'It is not important, it is only theory',
        'It directly improves how consultants convert enquiries into confirmed, satisfied bookings',
        'It only matters for managers, not executives',
        'It replaces the need for product knowledge',
      ],
      correct: 1,
    },
  ];
  return {
    id: dayNumber,
    dayNumber,
    week,
    weekTheme: WEEK_THEMES[week],
    title,
    objectives,
    material,
    examples,
    exercises,
    roleplayScenario: roleplay,
    quiz,
    updatedAt: new Date().toISOString(),
  };
}

function seedDays() {
  return DAY_TITLES.map((d, i) => buildDay(i + 1, d.title, d.week));
}

function emailFor(name) {
  return `${name.toLowerCase().split(' ')[0]}@velocity.travel`;
}

function seedUsers() {
  const users = [];
  const adminName = 'Asha Rao';
  users.push({
    id: uid('u'),
    name: adminName,
    email: emailFor(adminName),
    password: hashPassword('Admin@123'),
    role: 'admin',
    managerId: null,
    createdAt: new Date().toISOString(),
  });
  const mgr1Name = 'Vikram Shah';
  const mgr1 = {
    id: uid('u'),
    name: mgr1Name,
    email: emailFor(mgr1Name),
    password: hashPassword('Manager@123'),
    role: 'manager',
    managerId: null,
    createdAt: new Date().toISOString(),
  };
  const mgr2Name = 'Priya Nair';
  const mgr2 = {
    id: uid('u'),
    name: mgr2Name,
    email: emailFor(mgr2Name),
    password: hashPassword('Manager@123'),
    role: 'manager',
    managerId: null,
    createdAt: new Date().toISOString(),
  };
  users.push(mgr1, mgr2);

  const execNames = [
    ['Rohan Mehta', mgr1.id],
    ['Sneha Kulkarni', mgr1.id],
    ['Arjun Verma', mgr1.id],
    ['Divya Iyer', mgr2.id],
    ['Karan Malhotra', mgr2.id],
    ['Neha Joshi', mgr2.id],
  ];
  const execs = execNames.map(([name, managerId], i) => ({
    id: uid('u'),
    name,
    email: emailFor(name),
    password: hashPassword('Sales@123'),
    role: 'executive',
    managerId,
    createdAt: new Date().toISOString(),
  }));
  users.push(...execs);
  return users;
}

function seedProgress(users, days) {
  const progress = [];
  const execs = users.filter((u) => u.role === 'executive');
  execs.forEach((exec, idx) => {
    // Give each demo executive a bit of realistic history: first N days completed with scores,
    // day N+1 unlocked, rest locked.
    const completedCount = [5, 9, 2, 12, 0, 3][idx] || 0;
    days.forEach((day) => {
      let status = 'locked';
      if (day.dayNumber <= completedCount) status = 'completed';
      else if (day.dayNumber === completedCount + 1) status = 'unlocked';
      const row = {
        id: uid('p'),
        userId: exec.id,
        dayId: day.id,
        status,
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
      if (status === 'completed') {
        row.quizAnswers = day.quiz.map((q) => q.correct);
        row.quizScore = Math.round((2 + Math.random()) / 3 * 100) > 100 ? 100 : Math.round(70 + Math.random() * 30);
        row.roleplayResponse = 'Practiced the scenario with trainer; summarized approach and next steps.';
        row.trainerScore = Math.round(70 + Math.random() * 30);
        row.trainerFeedback = 'Good grasp of the concept. Keep working on confident delivery.';
        row.trainerId = exec.managerId;
        row.submittedAt = new Date().toISOString();
        row.completedAt = new Date().toISOString();
      }
      progress.push(row);
    });
  });
  return progress;
}

function defaultData() {
  const days = seedDays();
  const users = seedUsers();
  const progress = seedProgress(users, days);
  return { users, days, progress, sessions: [] };
}

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const data = defaultData();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return data;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    const data = defaultData();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return data;
  }
}

let cache = null;
function getDb() {
  if (!cache) cache = load();
  return cache;
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2));
}

module.exports = {
  getDb,
  save,
  uid,
  hashPassword,
  verifyPassword,
  WEEK_THEMES,
};
