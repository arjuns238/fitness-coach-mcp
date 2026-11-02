// REST API for the web dashboard. Same service layer as the MCP tools, so edits from either side match.
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as z from 'zod/v4';
import { authRequired, clearedSessionCookie, dashboardAuthorized, keyMatches, sessionCookie, setSessionEpoch } from './auth.ts';
import type { FitnessDb } from './db.ts';
import { InputError, NotFoundError } from './errors.ts';
import { DateInput, MealFields, ProfilePatch, WeightFields, WorkoutFields } from './schemas.ts';
import * as service from './service.ts';
import type { EntryKind } from './types.ts';

const MAX_BODY_BYTES = 1024 * 1024;
/** Login is read before anyone is authenticated, so it gets a much smaller body limit. */
const MAX_LOGIN_BYTES = 4096;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  // Requiring a JSON content type means a cross-site form post can't reach a handler (on top of SameSite=Strict).
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Expected application/json');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

const ENTRY_ROUTES: Record<string, { kind: EntryKind; create: z.ZodObject }> = {
  meals: { kind: 'meal', create: MealFields },
  workouts: { kind: 'workout', create: WorkoutFields },
  'weigh-ins': { kind: 'weigh_in', create: WeightFields },
};

async function entryRoute(db: FitnessDb, req: IncomingMessage, collection: string, id: number | undefined) {
  const route = ENTRY_ROUTES[collection];
  if (!route) throw new HttpError(404, 'Not found');
  const { kind } = route;

  if (id === undefined && req.method === 'POST') {
    const input = route.create.parse(await readJson(req));
    if (kind === 'meal') return service.logMeal(db, input as z.infer<typeof MealFields>);
    if (kind === 'workout') return service.logWorkout(db, input as z.infer<typeof WorkoutFields>);
    return service.logWeight(db, input as z.infer<typeof WeightFields>);
  }
  if (id !== undefined && req.method === 'PATCH') {
    const patch = route.create.partial().parse(await readJson(req));
    if (kind === 'meal') return service.updateMeal(db, id, patch as Partial<z.infer<typeof MealFields>>);
    if (kind === 'workout') return service.updateWorkout(db, id, patch as Partial<z.infer<typeof WorkoutFields>>);
    return service.updateWeight(db, id, patch as Partial<z.infer<typeof WeightFields>>);
  }
  if (id !== undefined && req.method === 'DELETE') return service.deleteEntry(db, kind, id);
  throw new HttpError(405, 'Method not allowed');
}

async function route(db: FitnessDb, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method ?? 'GET';

  if (path === '/session' && method === 'GET') {
    return send(res, 200, { auth_required: authRequired(), authenticated: dashboardAuthorized(req) });
  }
  if (path === '/login' && method === 'POST') {
    const { key } = z.object({ key: z.string().max(256) }).parse(await readJson(req, MAX_LOGIN_BYTES));
    if (!keyMatches(key)) throw new HttpError(401, 'Wrong key');
    return send(res, 200, { authenticated: true }, { 'set-cookie': sessionCookie(req) });
  }
  if (path === '/logout' && method === 'POST') {
    // JSON only, like every other POST, so another site can't sign you out with a form.
    await readJson(req, MAX_LOGIN_BYTES);
    return send(res, 200, { authenticated: false }, { 'set-cookie': clearedSessionCookie(req) });
  }

  if (!dashboardAuthorized(req)) throw new HttpError(401, 'Not signed in');

  if (path === '/logout-everywhere' && method === 'POST') {
    await readJson(req, MAX_LOGIN_BYTES);
    setSessionEpoch(db.bumpSessionEpoch());
    return send(res, 200, { authenticated: false }, { 'set-cookie': clearedSessionCookie(req) });
  }

  if (path === '/day' && method === 'GET') {
    return send(res, 200, service.getDay(db, DateInput.parse(url.searchParams.get('date') ?? undefined)));
  }
  if (path === '/month' && method === 'GET') {
    return send(res, 200, service.getMonth(db, url.searchParams.get('month') ?? ''));
  }
  if (path === '/trends' && method === 'GET') {
    const weeks = url.searchParams.get('weeks');
    return send(res, 200, service.getTrends(db, weeks === null ? undefined : Number(weeks)));
  }
  if (path === '/profile' && method === 'GET') return send(res, 200, db.getProfile());
  if (path === '/profile' && method === 'PATCH') {
    return send(res, 200, service.updateProfile(db, ProfilePatch.parse(await readJson(req))));
  }
  if (path === '/recent-meals' && method === 'GET') return send(res, 200, service.recentMeals(db));

  const entry = /^\/(meals|workouts|weigh-ins)(?:\/(\d+))?$/.exec(path);
  if (entry) return send(res, 200, await entryRoute(db, req, entry[1], entry[2] ? Number(entry[2]) : undefined));

  throw new HttpError(404, 'Not found');
}

export async function handleApi(db: FitnessDb, req: IncomingMessage, res: ServerResponse, url: URL) {
  try {
    await route(db, req, res, url);
  } catch (error) {
    if (error instanceof z.ZodError) return send(res, 400, { error: z.prettifyError(error) });
    if (error instanceof HttpError) return send(res, error.status, { error: error.message });
    if (error instanceof InputError) return send(res, 400, { error: error.message });
    if (error instanceof NotFoundError) return send(res, 404, { error: error.message });
    console.error('[api]', error);
    send(res, 500, { error: 'Internal error' });
  }
}
