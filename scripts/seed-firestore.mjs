#!/usr/bin/env node

// One-time setup helper for DeepDesign Client Roadmap.
// Uses Firebase Authentication + Firestore REST, so no service-account key is needed.
// Requires Node.js 18+ (built-in fetch).

import readline from 'node:readline/promises';
import process from 'node:process';

const PROJECT_ID = 'deepdesign-client-roadmap';
const API_KEY = 'AIzaSyDtEOc7Y4I7wi63T9jeygOwhDhXe97lp0'; // Firebase Web API key (public client config)
const PROJECT_DOC_ID = 'demo-client';
const PROJECT_NAME = 'DeepDesign Demo Client';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function hiddenQuestion(prompt) {
  if (!process.stdin.isTTY) return rl.question(prompt);
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return await new Promise((resolve, reject) => {
    let value = '';
    const onData = (ch) => {
      if (ch === '\u0003') {
        cleanup();
        reject(new Error('Cancelled'));
        return;
      }
      if (ch === '\r' || ch === '\n') {
        process.stdout.write('\n');
        cleanup();
        resolve(value);
        return;
      }
      if (ch === '\u007f' || ch === '\b') {
        if (value.length) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }
      value += ch;
      process.stdout.write('*');
    };
    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    process.stdin.on('data', onData);
  });
}

async function jsonOrText(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function signIn(email, password) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const body = await jsonOrText(res);
  if (!res.ok) throw new Error(`Login failed (${res.status}): ${body?.error?.message || body}`);
  return body;
}

function docUrl(path) {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
}

async function firestoreGet(path, token) {
  const res = await fetch(docUrl(path), { headers: { authorization: `Bearer ${token}` } });
  const body = await jsonOrText(res);
  return { res, body };
}

async function firestorePatch(path, token, document) {
  const res = await fetch(docUrl(path), {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(document)
  });
  const body = await jsonOrText(res);
  return { res, body };
}

try {
  console.log('\nDeepDesign Firestore setup');
  console.log(`Target project: ${PROJECT_ID}`);
  console.log('This script does not enable billing and does not access dd-approveme.\n');

  const email = (await rl.question('DeepDesign Admin email: ')).trim();
  const password = await hiddenQuestion('Password: ');

  const auth = await signIn(email, password);
  console.log(`\nAuthenticated UID: ${auth.localId}`);

  const member = await firestoreGet(`members/${auth.localId}`, auth.idToken);
  if (!member.res.ok) {
    throw new Error(`Cannot read members/${auth.localId} (${member.res.status}). Check that the member document exists and Firestore rules are deployed.`);
  }

  const role = member.body?.fields?.role?.stringValue;
  const projectIds = member.body?.fields?.projects?.arrayValue?.values?.map(v => v.stringValue).filter(Boolean) || [];
  if (role !== 'admin') throw new Error(`This account is not admin (current role: ${role || 'missing'}).`);
  if (!projectIds.includes(PROJECT_DOC_ID)) throw new Error(`Admin member does not include project '${PROJECT_DOC_ID}'.`);

  console.log(`Admin membership verified: role=${role}, projects=[${projectIds.join(', ')}]`);

  const existing = await firestoreGet(`projects/${PROJECT_DOC_ID}`, auth.idToken);
  if (existing.res.ok) {
    console.log(`\nprojects/${PROJECT_DOC_ID} already exists. No data was overwritten.`);
    console.log('Setup is complete.');
    process.exitCode = 0;
  } else if (existing.res.status !== 404) {
    throw new Error(`Cannot check project document (${existing.res.status}): ${JSON.stringify(existing.body)}`);
  } else {
    const document = {
      fields: {
        name: { stringValue: PROJECT_NAME },
        phases: { mapValue: { fields: {} } },
        kpi: { mapValue: { fields: {} } },
        notes: { stringValue: '' }
      }
    };
    const created = await firestorePatch(`projects/${PROJECT_DOC_ID}`, auth.idToken, document);
    if (!created.res.ok) {
      throw new Error(`Project creation failed (${created.res.status}): ${JSON.stringify(created.body)}\nIf you see PERMISSION_DENIED, deploy the repository Firestore rules first.`);
    }
    console.log(`\nCreated projects/${PROJECT_DOC_ID} successfully.`);
    console.log(`Name: ${PROJECT_NAME}`);
    console.log('Setup is complete.');
  }
} catch (err) {
  console.error(`\nERROR: ${err.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
