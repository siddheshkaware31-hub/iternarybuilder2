# Velocity Holiday Sales Academy

A 30-day Holiday Sales training & assessment platform for Velocity.travel.

## Stack
Plain Node.js (no external dependencies — no `npm install` needed):
- `server.js` — HTTP server + full REST API (built on Node's core `http` module)
- `lib/db.js` — JSON-file datastore, seeded with the 30-day curriculum and demo users
- `lib/auth.js` — signed-cookie session auth
- `public/` — single-page frontend (vanilla HTML/CSS/JS, no build step)

## Run it
```
node server.js
```
Then open **http://localhost:3000**. Data is stored in `data/db.json`, created automatically on first run (delete it to reset to the seeded demo state).

## Demo logins
| Role | Email | Password |
|---|---|---|
| Admin | asha@velocity.travel | Admin@123 |
| Manager | vikram@velocity.travel | Manager@123 |
| Manager | priya@velocity.travel | Manager@123 |
| Sales Executive | rohan@velocity.travel (or sneha / arjun / divya / karan / neha) | Sales@123 |

## What's implemented
- **Role-based access**: Admin, Manager/Trainer, Sales Executive — each with their own dashboard and permissions, enforced server-side.
- **30-day curriculum**, seeded across the 4 requested weeks (Sales Foundation & Travel Knowledge / Objection Handling / Conversion & Follow-up / Advanced Sales + Client Experience). Every day includes topic, learning objectives, training material, examples, exercises, a role-play scenario, and a 3-question quiz.
- **Executive flow**: sequential day unlocking, read material, submit quiz (auto-graded) + role-play summary, view trainer feedback/score, track progress across the program.
- **Manager flow**: view assigned team, review submissions, score + give written feedback, mark days complete (which unlocks the employee's next day).
- **Admin flow**: edit curriculum content per day, add/manage employees and their manager assignments, view team-wide performance, export all progress as CSV.

## Known limitation
This is a self-contained standalone app (no existing Velocity.travel codebase was available to integrate into — see chat). It hasn't been deployed anywhere; it runs locally via `node server.js`. For real deployment, put it behind a process manager (pm2/systemd) and a reverse proxy (nginx) with HTTPS, and swap the JSON-file datastore for a real database if concurrent write volume grows.
