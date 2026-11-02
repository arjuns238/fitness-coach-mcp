// End-to-end check against a real server process on a throwaway database.
// Exercises the 2025-era stateless HTTP flow (what claude.ai connectors speak today)
// and the 2026-07-28 flow via the official client.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const PORT = 3917;
const KEY = 'smoke-test-key';
const URL_ = `http://127.0.0.1:${PORT}/mcp`;
const dir = mkdtempSync(join(tmpdir(), 'fitness-smoke-'));

const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/index.ts'], {
  env: { ...process.env, PORT: String(PORT), MCP_API_KEY: KEY, DB_PATH: join(dir, 'test.db'), USER_TIMEZONE: 'America/Chicago' },
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

  console.log('2026-07-28 flow (official client)');
  await check('client connects, lists tools and calls get_summary', async () => {
    const client = new Client({ name: 'smoke', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(URL_), { requestInit: { headers: { authorization: `Bearer ${KEY}` } } }));
    const { tools } = await client.listTools();
    assert.equal(tools.length, 10);
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
