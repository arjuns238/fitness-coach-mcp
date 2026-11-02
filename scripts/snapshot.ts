// Nightly job (deploy/azure.sh schedules it): restore the latest Litestream replica into a plain SQLite
// file, check it, and upload it as snapshots/day-DD.db next to the replica. That keeps a rolling month of
// daily copies that any SQLite tool can open, independent of Litestream's own format.
//
// Runs with the same managed identity and environment as the app, but only reads the replica, so it is
// safe while the app is running.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** A token from the Container Apps managed identity endpoint, for the identity named by AZURE_CLIENT_ID. */
async function managedIdentityToken(resource: string): Promise<string> {
  const url = new URL(env('IDENTITY_ENDPOINT'));
  url.searchParams.set('resource', resource);
  url.searchParams.set('api-version', '2019-08-01');
  url.searchParams.set('client_id', env('AZURE_CLIENT_ID'));
  const res = await fetch(url, { headers: { 'X-IDENTITY-HEADER': env('IDENTITY_HEADER') } });
  if (!res.ok) throw new Error(`managed identity token: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

const out = '/tmp/snapshot.db';
rmSync(out, { force: true });
execFileSync('litestream', ['restore', '-o', out, process.env.DB_PATH ?? '/data/fitness.db'], { stdio: 'inherit' });

const db = new DatabaseSync(out, { readOnly: true });
const { integrity_check } = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
const counts = db.prepare('SELECT (SELECT count(*) FROM meals) AS meals, (SELECT count(*) FROM workouts) AS workouts').get();
db.close();
if (integrity_check !== 'ok') throw new Error(`restored database failed its integrity check: ${integrity_check}`);

const name = `snapshots/day-${String(new Date().getUTCDate()).padStart(2, '0')}.db`;
const blobUrl = `https://${env('LITESTREAM_ACCOUNT')}.blob.core.windows.net/${env('LITESTREAM_CONTAINER')}/${name}`;
const res = await fetch(blobUrl, {
  method: 'PUT',
  headers: {
    authorization: `Bearer ${await managedIdentityToken('https://storage.azure.com/')}`,
    'x-ms-version': '2023-11-03',
    'x-ms-blob-type': 'BlockBlob',
    'content-type': 'application/vnd.sqlite3',
  },
  body: readFileSync(out),
});
if (!res.ok) throw new Error(`upload ${name}: ${res.status} ${await res.text()}`);
console.log(`uploaded ${name}`, counts);
