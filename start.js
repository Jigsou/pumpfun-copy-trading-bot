import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const RESTART_BACKEND = 42;
const RESTART_ALL = 43;
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const serverFile = path.join(root, 'server.js');

if (!fs.existsSync(viteBin)) {
  console.error('Dependencies are missing. Run: npm install --ignore-scripts');
  process.exit(1);
}

const env = { ...process.env, PUMP_SUPERVISED: '1' };
let backend = null;
let frontend = null;
let shuttingDown = false;

function launch(name, file) {
  const child = spawn(process.execPath, [file], { cwd: root, env, stdio: 'inherit' });
  child.on('error', (error) => console.error(`Error starting ${name}:`, error));
  return child;
}

function startBackend() {
  console.log('Starting backend server...');
  const child = launch('backend', serverFile);
  backend = child;
  child.on('exit', (code) => {
    if (shuttingDown || backend !== child) return;
    if (code === RESTART_BACKEND || code === RESTART_ALL) {
      console.log(code === RESTART_ALL ? 'Update applied: restarting backend and frontend...' : 'Update applied: restarting backend...');
      if (code === RESTART_ALL) restartFrontend();
      setTimeout(() => {
        if (!shuttingDown) startBackend();
      }, 500);
    } else {
      console.log(`Backend stopped (code ${code}).`);
    }
  });
}

function startFrontend() {
  console.log('Starting frontend server...');
  frontend = launch('frontend', viteBin);
}

function restartFrontend() {
  const old = frontend;
  frontend = null;
  if (old && old.exitCode === null && old.signalCode === null) {
    old.once('exit', () => {
      if (!shuttingDown) startFrontend();
    });
    old.kill();
  } else {
    startFrontend();
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Shutting down servers...');
  backend?.kill();
  frontend?.kill();
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startBackend();
startFrontend();
