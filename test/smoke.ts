// End-to-end check against a real server process on a throwaway database.
// Exercises the 2025-era stateless HTTP flow (what claude.ai connectors speak today)
// and the 2026-07-28 flow via the official client.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const PORT = 3917;
const KEY = 'smoke-test-key';
const URL_ = `http://127.0.0.1:${PORT}/mcp`;
const dir = mkdtempSync(join(tmpdir(), 'fitness-smoke-'));
// A stand-in for the built dashboard, so this test doesn't depend on `npm run build`.
mkdirSync(join(dir, 'web/assets'), { recursive: true });
writeFileSync(join(dir, 'web/index.html'), '<!doctype html><title>shell</title>');
writeFileSync(join(dir, 'web/assets/app-abc123.js'), 'console.log(1)');

const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/index.ts'], {
  env: { ...process.env, PORT: String(PORT), MCP_API_KEY: KEY, DB_PATH: join(dir, 'test.db'), WEB_DIR: join(dir, 'web'), USER_TIMEZONE: 'America/Chicago' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise<void>((resolve, reject) => {
  server.stdout.on('data', (chunk: Buffer) => chunk.toString().includes('MCP server on') && resolve());
  server.on('exit', (code) => reject(new Error(`server exited with ${code}`)));
});

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

let nextId = 1;
async function post(body: object, headers: Record<string, string> = {}) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${KEY}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const payload = res.headers.get('content-type')?.includes('text/event-stream')
    ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5))).at(-1)
    : text
      ? JSON.parse(text)
      : undefined;
  return { status: res.status, payload };
}

/** 2025-06-18 tools/call; returns the parsed JSON text content and the isError flag. */
async function callLegacy(name: string, args: object = {}) {
  const { status, payload } = await post(
    { jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } },
    { 'mcp-protocol-version': '2025-06-18' },
  );
  assert.equal(status, 200, JSON.stringify(payload));
  const result = payload.result;
  const text = result.content[0].text as string;
  return { isError: Boolean(result.isError), text, data: result.isError ? undefined : JSON.parse(text) };
}

try {
  console.log('HTTP + auth');
  await check('health endpoint', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`);
    assert.equal(res.status, 200);
  });
  await check('rejects missing and wrong keys with a bare 401', async () => {
    for (const authorization of ['', 'Bearer wrong']) {
      const { status } = await post({ jsonrpc: '2.0', id: 0, method: 'tools/list' }, { authorization });
      assert.equal(status, 401);
    }
    const res = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.headers.get('www-authenticate'), null);
  });
  await check('rejects a foreign Host header', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(URL_, { method: 'POST', headers: { host: 'evil.example', 'content-type': 'application/json' } }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      });
      req.on('error', reject);
      req.end('{}');
    });
    assert.equal(status, 403);
  });

  console.log('2025-era stateless flow (claude.ai)');
  for (const protocolVersion of ['2025-06-18', '2025-11-25']) {
    await check(`initialize at ${protocolVersion} (X-API-Key auth)`, async () => {
      const { status, payload } = await post(
        {
          jsonrpc: '2.0',
          id: nextId++,
          method: 'initialize',
          params: { protocolVersion, capabilities: {}, clientInfo: { name: 'smoke', version: '1.0.0' } },
        },
        { authorization: '', 'x-api-key': KEY },
      );
      assert.equal(status, 200, JSON.stringify(payload));
      assert.equal(payload.result.protocolVersion, protocolVersion);
      assert.equal(payload.result.serverInfo.name, 'fitness-coach');
      assert.match(payload.result.instructions, /voice/);
    });
  }
  await check('initialized notification', async () => {
    const { status } = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, { 'mcp-protocol-version': '2025-06-18' });
    assert.equal(status, 202);
  });
  await check('tools/list', async () => {
    const { payload } = await post({ jsonrpc: '2.0', id: nextId++, method: 'tools/list' }, { 'mcp-protocol-version': '2025-06-18' });
    const names = payload.result.tools.map((t: { name: string }) => t.name).sort();
    assert.deepEqual(names, [
      'delete_entry',
      'get_day',
      'get_summary',
      'get_trends',
      'log_meal',
      'log_weight',
      'log_workout',
      'update_meal',
      'update_profile',
      'update_weight',
      'update_workout',
    ]);
  });

  await check('update_profile sets goals and validates timezone', async () => {
    const { data } = await callLegacy('update_profile', {
      daily_calories: 2200,
      daily_protein_g: 160,
      workouts_per_week: 4,
      target_weight: 175,
      coaching_notes: 'Cutting until March. Lifts 4x/week.',
    });
    assert.equal(data.daily_calories, 2200);
    assert.equal(data.weight_unit, 'lb');
    assert.equal(data.timezone, 'America/Chicago');
    assert.equal((await callLegacy('update_profile', { timezone: 'Mars/Olympus' })).isError, true);
  });

  let breakfastId = 0;
  await check('log_meal totals items and returns running day totals', async () => {
    const { data } = await callLegacy('log_meal', {
      description: 'three eggs and toast with a black coffee',
      meal_type: 'breakfast',
      items: [
        { name: 'eggs', quantity: '3 large', calories: 216, protein_g: 18.9, carbs_g: 1.1, fat_g: 14.3 },
        { name: 'toast', quantity: '2 slices', calories: 160, protein_g: 6, carbs_g: 28, fat_g: 2 },
        { name: 'black coffee', calories: 2, protein_g: 0.3, carbs_g: 0, fat_g: 0 },
      ],
    });
    breakfastId = data.logged.id;
    assert.equal(data.logged.calories, 378);
    assert.equal(data.logged.protein_g, 25.2);
    assert.equal(data.day.totals.calories, 378);
    assert.equal(data.day.remaining_vs_goals.calories, 1822);
  });
  await check('log_meal resolves "yesterday" and defaults dinner to 19:00', async () => {
    const { data } = await callLegacy('log_meal', {
      description: 'chicken burrito bowl',
      meal_type: 'dinner',
      date: 'yesterday',
      items: [{ name: 'burrito bowl', calories: 750, protein_g: 45, carbs_g: 80, fat_g: 25 }],
    });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
    assert.notEqual(data.logged.local_date, today);
    assert.equal(data.logged.local_time, '19:00');
  });
  await check('log_workout fills in the default weight unit', async () => {
    const { data } = await callLegacy('log_workout', {
      description: 'push day',
      type: 'strength',
      duration_min: 50,
      effort: 8,
      exercises: [{ name: 'bench press', sets: [{ reps: 8, weight: 135 }, { reps: 8, weight: 135 }, { reps: 6, weight: 145 }] }],
    });
    assert.equal(data.logged.exercises[0].sets[2].unit, 'lb');
    assert.equal(data.day.workouts_logged, 1);
  });
  let workoutId = 0;
  await check('update_workout fills in a missing set and keeps other fields', async () => {
    const { data: day } = await callLegacy('get_day');
    workoutId = day.workouts[0].id;
    const { data } = await callLegacy('update_workout', {
      id: workoutId,
      exercises: [
        { name: 'bench press', sets: [{ reps: 8, weight: 135 }, { reps: 8, weight: 135 }, { reps: 6, weight: 145 }] },
        { name: 'overhead press', sets: [{ reps: 10, weight: 30, unit: 'kg' }] },
      ],
    });
    assert.equal(data.updated.exercises.length, 2);
    assert.equal(data.updated.exercises[1].sets[0].unit, 'kg');
    assert.equal(data.updated.duration_min, 50);
    assert.equal(data.updated.effort, 8);
    assert.equal(data.updated.description, 'push day');
  });
  await check('log_weight, then update_weight corrects it', async () => {
    const { data } = await callLegacy('log_weight', { weight: 128.4 });
    assert.equal(data.logged.unit, 'lb');
    assert.equal(data.target_weight, 175);
    const { data: fixed } = await callLegacy('update_weight', { id: data.logged.id, weight: 182.4 });
    assert.equal(fixed.updated.weight, 182.4);
    assert.equal(fixed.updated.local_date, data.logged.local_date);
  });
  await check('update_meal after a follow-up recomputes meal and day totals', async () => {
    // "It was 4 eggs, cooked in a tablespoon of butter."
    const { data } = await callLegacy('update_meal', {
      id: breakfastId,
      items: [
        { name: 'eggs', quantity: '4 large', calories: 288, protein_g: 25.2, carbs_g: 1.4, fat_g: 19 },
        { name: 'butter', quantity: '1 tbsp', calories: 102, protein_g: 0.1, carbs_g: 0, fat_g: 11.5 },
        { name: 'toast', quantity: '2 slices', calories: 160, protein_g: 6, carbs_g: 28, fat_g: 2 },
        { name: 'black coffee', calories: 2, protein_g: 0.3, carbs_g: 0, fat_g: 0 },
      ],
    });
    assert.equal(data.updated.id, breakfastId);
    assert.equal(data.updated.calories, 552);
    assert.equal(data.updated.meal_type, 'breakfast');
    assert.equal(data.updated.description, 'three eggs and toast with a black coffee');
    assert.equal(data.day.totals.calories, 552);
    assert.equal(data.day.meals_logged, 1);
  });
  await check('update_meal can move an entry to another day', async () => {
    const { data } = await callLegacy('update_meal', { id: breakfastId, date: 'yesterday', time: '09:15' });
    assert.equal(data.updated.local_time, '09:15');
    assert.equal(data.day.meals_logged, 2);
    const back = await callLegacy('update_meal', { id: breakfastId, date: 'today', time: '08:00' });
    assert.equal(back.data.day.meals_logged, 1);
  });
  await check('updates report unknown ids and reject empty item lists', async () => {
    const missing = await callLegacy('update_meal', { id: 9999, notes: 'x' });
    assert.equal(missing.isError, true);
    assert.match(missing.text, /No meal with id 9999/);
    assert.equal((await callLegacy('update_meal', { id: breakfastId, items: [] })).isError, true);
    assert.equal((await callLegacy('update_workout', { id: 9999, effort: 5 })).isError, true);
  });
  await check('get_day returns entries, totals and profile', async () => {
    const { data } = await callLegacy('get_day');
    assert.equal(data.meals.length, 1);
    assert.equal(data.workouts.length, 1);
    assert.equal(data.weigh_ins.length, 1);
    assert.equal(data.meals[0].items.length, 4);
    assert.match(data.now, /America\/Chicago/);
    assert.equal(data.profile.coaching_notes, 'Cutting until March. Lifts 4x/week.');
  });
  await check('get_summary covers the last 7 days', async () => {
    const { data } = await callLegacy('get_summary');
    assert.equal(data.days.length, 7);
    assert.equal(data.nutrition.days_with_meals_logged, 2);
    // Only yesterday is a completed logged day; today is in progress.
    assert.equal(data.nutrition.averages_per_logged_day.calories, 750);
    assert.equal(data.training.workouts, 1);
    assert.equal(data.weight.last.weight, 182.4);
    assert.equal(data.days.at(-1).in_progress, true);
  });
  await check('get_summary rejects bad ranges', async () => {
    assert.equal((await callLegacy('get_summary', { start_date: '2026-01-10', end_date: '2026-01-01' })).isError, true);
    assert.equal((await callLegacy('get_summary', { start_date: '2025-01-01', end_date: '2026-01-01' })).isError, true);
    assert.equal((await callLegacy('get_day', { date: '2026-02-30' })).isError, true);
  });
  await check('delete_entry removes once, then reports not found', async () => {
    const { data } = await callLegacy('delete_entry', { kind: 'meal', id: breakfastId });
    assert.equal(data.deleted.calories, 552);
    const again = await callLegacy('delete_entry', { kind: 'meal', id: breakfastId });
    assert.equal(again.isError, true);
    assert.match(again.text, /No meal with id/);
  });
  await check('schema validation rejects a meal with no items', async () => {
    assert.equal((await callLegacy('log_meal', { description: 'nothing', items: [] })).isError, true);
  });

  console.log('Dashboard API');
  const BASE = `http://127.0.0.1:${PORT}`;
  let session = '';
  async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(session ? { cookie: session } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json().catch(() => undefined), headers: res.headers };
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

  await check('session reports auth required and signed out', async () => {
    const { data } = await api('GET', '/session');
    assert.deepEqual(data, { auth_required: true, authenticated: false });
    assert.equal((await api('GET', '/day')).status, 401);
  });
  await check('login rejects a wrong key and sets a strict HttpOnly cookie for the right one', async () => {
    assert.equal((await api('POST', '/login', { key: 'nope' })).status, 401);
    const { status, headers } = await api('POST', '/login', { key: KEY });
    assert.equal(status, 200);
    const cookie = headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.doesNotMatch(cookie, /Secure/); // plain http locally
    session = cookie.split(';')[0];
    assert.deepEqual((await api('GET', '/session')).data, { auth_required: true, authenticated: true });
  });
  await check('a forged or tampered session cookie is rejected', async () => {
    const [name, value] = session.split('=');
    const [issued] = value.split('.');
    const forged = await fetch(`${BASE}/api/day`, { headers: { cookie: `${name}=${issued}.AAAA` } });
    assert.equal(forged.status, 401);
  });
  await check('the API key also works as a bearer token', async () => {
    const res = await fetch(`${BASE}/api/profile`, { headers: { authorization: `Bearer ${KEY}` } });
    assert.equal(res.status, 200);
  });
  await check('mutations require a JSON body', async () => {
    const res = await api('POST', '/meals', 'description=x', { 'content-type': 'application/x-www-form-urlencoded' });
    assert.equal(res.status, 415);
  });
  let mealId = 0;
  await check('create, edit and delete a meal', async () => {
    const created = await api('POST', '/meals', {
      description: 'greek yogurt bowl',
      meal_type: 'snack',
      date: today,
      time: '16:00',
      items: [{ name: 'greek yogurt', quantity: '1 cup', calories: 150, protein_g: 20, carbs_g: 8, fat_g: 4 }],
    });
    assert.equal(created.status, 200);
    mealId = created.data.logged.id;
    const edited = await api('PATCH', `/meals/${mealId}`, {
      items: [
        { name: 'greek yogurt', quantity: '1 cup', calories: 150, protein_g: 20, carbs_g: 8, fat_g: 4 },
        { name: 'honey', quantity: '1 tbsp', calories: 64, protein_g: 0, carbs_g: 17, fat_g: 0 },
      ],
      notes: 'added honey',
    });
    assert.equal(edited.data.updated.calories, 214);
    assert.equal(edited.data.updated.notes, 'added honey');
    assert.equal(edited.data.updated.local_time, '16:00');
    const day = await api('GET', `/day?date=${today}`);
    assert.ok(day.data.meals.some((m: { id: number }) => m.id === mealId));
  });
  await check('validation and not-found errors come back as 400 / 404 with a message', async () => {
    const bad = await api('POST', '/meals', { description: 'x', items: [] });
    assert.equal(bad.status, 400);
    assert.match(bad.data.error, /items/);
    assert.equal((await api('PATCH', '/workouts/9999', { effort: 5 })).status, 404);
    assert.equal((await api('GET', '/day?date=2026-13-45')).status, 400);
    assert.equal((await api('GET', '/nope')).status, 404);
  });
  await check('workouts and weigh-ins round-trip', async () => {
    const workout = await api('POST', '/workouts', {
      description: 'easy run',
      type: 'cardio',
      date: today,
      time: '07:00',
      exercises: [{ name: 'run', distance: 3.1, distance_unit: 'mi', duration_min: 28 }],
    });
    assert.equal(workout.status, 200);
    const weigh = await api('POST', '/weigh-ins', { weight: 81.5, unit: 'kg', date: today, time: '07:30' });
    assert.equal(weigh.data.logged.unit, 'kg');
    assert.equal((await api('PATCH', `/weigh-ins/${weigh.data.logged.id}`, { weight: 81.2 })).data.updated.weight, 81.2);
    assert.equal((await api('DELETE', `/workouts/${workout.data.logged.id}`)).status, 200);
    assert.equal((await api('DELETE', `/workouts/${workout.data.logged.id}`)).status, 404);
  });
  await check('month summary covers every day of the month', async () => {
    const { data } = await api('GET', '/month?month=2026-02');
    assert.equal(data.days.length, 28);
    assert.equal(data.days[0].date, '2026-02-01');
    assert.equal((await api('GET', '/month?month=2026-2')).status, 400);
  });
  await check('profile updates, validation, and recent meals', async () => {
    const { data } = await api('PATCH', '/profile', { daily_fat_g: 70, coaching_notes: null });
    assert.equal(data.daily_fat_g, 70);
    assert.equal(data.coaching_notes, undefined);
    assert.equal((await api('PATCH', '/profile', { timezone: 'Nowhere/Land' })).status, 400);
    const recent = await api('GET', '/recent-meals');
    assert.equal(recent.data[0].description, 'greek yogurt bowl');
    assert.equal((await api('DELETE', `/meals/${mealId}`)).status, 200);
  });
  await check('trends: whole weeks for the charts, and get_trends without the day rows', async () => {
    const { status, data } = await api('GET', '/trends?weeks=4');
    assert.equal(status, 200);
    assert.equal(data.weeks.length, 4);
    assert.equal(data.days.at(-1).date, today);
    assert.deepEqual(data.maintenance.requirements, { logged_days: 14, weigh_ins: 4, weigh_in_span_days: 14 });
    assert.equal((await api('GET', '/trends?weeks=0')).status, 400);
    assert.equal((await api('GET', '/trends?weeks=abc')).status, 400);
    const viaMcp = await callLegacy('get_trends', { weeks: 4 });
    assert.equal(viaMcp.isError, false);
    assert.equal(viaMcp.data.days, undefined);
    assert.equal(viaMcp.data.weeks.length, 4);
  });
  await check('logout clears the cookie', async () => {
    const { headers } = await api('POST', '/logout', {});
    assert.match(headers.get('set-cookie')!, /Max-Age=0/);
  });

  console.log('Dashboard files');
  await check('serves the app shell, assets, and SPA fallback; 404s missing files', async () => {
    const shell = await fetch(`${BASE}/`);
    assert.equal(shell.status, 200);
    assert.match(shell.headers.get('content-type')!, /text\/html/);
    assert.equal(shell.headers.get('cache-control'), 'no-cache');
    const asset = await fetch(`${BASE}/assets/app-abc123.js`);
    assert.match(asset.headers.get('cache-control')!, /immutable/);
    assert.equal((await fetch(`${BASE}/history/2026-11`)).status, 200);
    assert.equal((await fetch(`${BASE}/assets/missing.js`)).status, 404);
  });
  await check('path traversal cannot reach files outside the web root', async () => {
    // The database sits one level above the web root; send raw paths so nothing normalizes them first.
    for (const path of ['/../test.db', '/%2e%2e/test.db', '/assets/..%2f..%2ftest.db']) {
      const { status, body } = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port: PORT, path }, (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ status: res.statusCode!, body }));
        });
        req.on('error', reject);
        req.end();
      });
      assert.equal(status, 404, path);
      assert.doesNotMatch(body, /SQLite/, path);
    }
  });

  console.log('2026-07-28 flow (official client)');
  await check('client connects, lists tools and calls get_summary', async () => {
    const client = new Client({ name: 'smoke', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(URL_), { requestInit: { headers: { authorization: `Bearer ${KEY}` } } }));
    const { tools } = await client.listTools();
    assert.equal(tools.length, 11);
    const result = await client.callTool({ name: 'get_summary', arguments: { days: 3 } });
    assert.equal(result.isError, undefined);
    const content = result.content as Array<{ type: string; text: string }>;
    assert.equal(JSON.parse(content[0].text).days.length, 3);
    await client.close();
  });

  console.log(`\n${passed} checks passed`);
} finally {
  server.kill();
  rmSync(dir, { recursive: true, force: true });
}
