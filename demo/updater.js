import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const NL = String.fromCharCode(10);

export const RESTART_BACKEND = 42;
export const RESTART_ALL = 43;
export const CHANNELS = ['main', 'dev'];

const lines = (text) => String(text).split(NL).map((s) => s.trim()).filter(Boolean);

export function planFor(files) {
  const has = (fn) => files.some(fn);
  const depsChanged = has((f) => f === 'package.json' || f === 'package-lock.json');
  const startChanged = files.includes('start.js');
  const frontendConfig = has((f) => f.startsWith('vite.config.') || f.startsWith('tailwind.config.') || f.startsWith('postcss.config.'));
  const backend = has((f) => f === 'server.js' || (f.startsWith('demo/') && f.endsWith('.js')));
  return {
    depsChanged,
    startChanged,
    restartBackend: backend || depsChanged,
    restartFrontend: depsChanged || frontendConfig,
  };
}

export function createUpdater({ cwd, isDemoRunning = () => false, supervised = false, npmExecPath = null, nodePath = process.execPath, gitTimeoutMs = 90000 }) {
  let busy = false;

  const gitRaw = async (args, timeout = 60000) => {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });
    return String(stdout);
  };
  const git = async (args, timeout = 60000) => (await gitRaw(args, timeout)).trim();
  const short = (sha) => String(sha).slice(0, 7);
  const explain = (e) => String(e?.stderr || e?.message || e).trim().slice(0, 500);

  async function currentBranch() {
    try {
      return await git(['rev-parse', '--abbrev-ref', 'HEAD']);
    } catch {
      return null;
    }
  }

  async function dirtyFiles() {
    const out = await gitRaw(['status', '--porcelain', '--untracked-files=no']);
    return out.split(NL).filter((l) => l.trim()).map((l) => l.slice(3).trim());
  }

  async function stashLocal(label) {
    await git(['-c', 'user.name=pumpbot', '-c', 'user.email=pumpbot@localhost', 'stash', 'push', '-m', 'pumpbot auto-stash before ' + label]);
  }

  function needsStash(action, branch, conflicts) {
    return {
      ok: false,
      needsStash: true,
      action,
      branch,
      dirtyFiles: conflicts.slice(0, 30),
      message: 'Your local changes in ' + conflicts.slice(0, 6).join(', ') + ' would be overwritten.',
    };
  }

  function withStashNote(result, count) {
    if (!result.ok) return result;
    return { ...result, stashed: true, message: result.message + ' Your local changes to ' + count + ' file(s) were saved aside (git stash); restore them with: git stash pop.' };
  }

  async function version() {
    try {
      const head = await git(['rev-parse', '--short', 'HEAD']);
      return { head, branch: await currentBranch(), supervised, channels: CHANNELS };
    } catch {
      return { head: null, branch: null, supervised, channels: CHANNELS };
    }
  }

  async function otherChannels(current) {
    const out = [];
    for (const b of CHANNELS) {
      if (b === current) continue;
      try {
        const n = Number(await git(['rev-list', '--count', 'HEAD..origin/' + b]));
        if (n > 0) out.push({ branch: b, ahead: n });
      } catch {
        // branch not on GitHub
      }
    }
    return out;
  }

  function hint(others) {
    if (!others.length) return '';
    return ' ' + others.map((o) => 'Branch ' + o.branch + ' has ' + o.ahead + ' newer commit(s): switch the channel to try them.').join(' ');
  }

  async function finish(before, after, lead, progress) {
    const files = lines(await git(['diff', '--name-only', before, after]));
    const plan = planFor(files);
    const base = { ok: true, changed: true, from: short(before), to: short(after), head: short(after), branch: await currentBranch(), files: files.slice(0, 30) };

    if (plan.depsChanged) {
      if (!npmExecPath) {
        return { ...base, restarting: false, manual: true, message: lead + '. Dependencies changed: stop the server, run npm install --ignore-scripts, then npm start.' };
      }
      progress('Installing dependencies...');
      try {
        await execFileAsync(nodePath, [npmExecPath, 'install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd, timeout: 300000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
      } catch (e) {
        return { ok: false, message: lead + ' but npm install failed: ' + explain(e) };
      }
    }
    if (plan.startChanged) {
      return { ...base, restarting: false, manual: true, message: lead + '. The launcher (start.js) changed: stop the server with Ctrl+C and run npm start again.' };
    }
    if (plan.restartBackend || plan.restartFrontend) {
      if (!supervised) {
        return { ...base, restarting: false, manual: true, message: lead + '. A restart is needed: stop the server with Ctrl+C and run npm start (it was not started through npm start).' };
      }
      return { ...base, restarting: true, exitCode: plan.restartFrontend ? RESTART_ALL : RESTART_BACKEND, message: lead + '. Restarting the local server...' };
    }
    return { ...base, restarting: false, message: lead + '. No restart needed, the page reloads by itself.' };
  }

  async function run({ confirmed = false, stash = false } = {}, progress = () => {}) {
    if (busy) return { ok: false, message: 'An update is already running.' };
    busy = true;
    try {
      try {
        await git(['rev-parse', '--is-inside-work-tree']);
      } catch (e) {
        return { ok: false, message: 'Not a git repository, or git is not installed: ' + explain(e) };
      }
      const before = await git(['rev-parse', 'HEAD']);
      const branch = await currentBranch();
      progress('Checking GitHub...');
      try {
        await git(['fetch', '--quiet', '--prune'], gitTimeoutMs);
      } catch (e) {
        return { ok: false, message: 'git fetch failed: ' + explain(e) };
      }
      let upstream;
      try {
        upstream = await git(['rev-parse', '@{u}']);
      } catch {
        return { ok: false, message: 'No upstream branch is configured for this checkout.' };
      }
      let behind = upstream === before ? 0 : 1;
      if (upstream !== before) {
        try {
          behind = Number(await git(['rev-list', '--count', 'HEAD..@{u}']));
        } catch {
          behind = 1;
        }
      }
      if (behind === 0) {
        const others = await otherChannels(branch);
        const msg = upstream === before ? 'Already up to date on ' + branch + '.' : 'Nothing to pull: your copy is ahead of GitHub on ' + branch + '.';
        return { ok: true, changed: false, head: short(before), branch, others, message: msg + hint(others) };
      }

      const incoming = lines(await git(['diff', '--name-only', 'HEAD', '@{u}']));
      const conflicts = (await dirtyFiles()).filter((f) => incoming.includes(f));
      if (conflicts.length && !stash) return needsStash('update', branch, conflicts);
      const expected = planFor(incoming);
      if (expected.restartBackend && supervised && isDemoRunning() && !confirmed) {
        return {
          ok: true,
          needsConfirm: true,
          action: 'update',
          files: incoming.slice(0, 30),
          message: 'This update restarts the local server. The simulation resumes automatically, but the statistics start again from zero.',
        };
      }

      if (conflicts.length) {
        progress('Saving your local changes aside...');
        try {
          await stashLocal('update');
        } catch (e) {
          return { ok: false, message: 'git stash failed: ' + explain(e) };
        }
      }
      progress('Pulling ' + behind + ' commit(s)...');
      try {
        await git(['pull', '--ff-only', '--quiet'], 120000);
      } catch (e) {
        return { ok: false, message: 'git pull failed: ' + explain(e) };
      }
      const after = await git(['rev-parse', 'HEAD']);
      const result = await finish(before, after, 'Updated to ' + short(after), progress);
      return conflicts.length ? withStashNote(result, conflicts.length) : result;
    } finally {
      busy = false;
    }
  }

  async function switchChannel(branch, { confirmed = false, stash = false } = {}, progress = () => {}) {
    if (!CHANNELS.includes(branch)) return { ok: false, message: 'Unknown channel: ' + branch };
    if (busy) return { ok: false, message: 'An update is already running.' };
    busy = true;
    try {
      try {
        await git(['rev-parse', '--is-inside-work-tree']);
      } catch (e) {
        return { ok: false, message: 'Not a git repository, or git is not installed: ' + explain(e) };
      }
      const before = await git(['rev-parse', 'HEAD']);
      const current = await currentBranch();
      if (current === branch) return { ok: true, changed: false, head: short(before), branch, message: 'Already on ' + branch + '.' };
      progress('Checking GitHub...');
      try {
        await git(['fetch', '--quiet', '--prune'], gitTimeoutMs);
      } catch (e) {
        return { ok: false, message: 'git fetch failed: ' + explain(e) };
      }
      let target;
      try {
        target = await git(['rev-parse', 'origin/' + branch]);
      } catch {
        return { ok: false, message: 'Branch ' + branch + ' does not exist on GitHub.' };
      }
      const incoming = lines(await git(['diff', '--name-only', 'HEAD', target]));
      const conflicts = (await dirtyFiles()).filter((f) => incoming.includes(f));
      if (conflicts.length && !stash) return needsStash('switch', branch, conflicts);
      const expected = planFor(incoming);
      if (expected.restartBackend && supervised && isDemoRunning() && !confirmed) {
        return {
          ok: true,
          needsConfirm: true,
          action: 'switch',
          branch,
          files: incoming.slice(0, 30),
          message: 'Switching to ' + branch + ' restarts the local server. The simulation resumes automatically, but the statistics start again from zero.',
        };
      }
      if (conflicts.length) {
        progress('Saving your local changes aside...');
        try {
          await stashLocal('switching to ' + branch);
        } catch (e) {
          return { ok: false, message: 'git stash failed: ' + explain(e) };
        }
      }
      progress('Switching to ' + branch + '...');
      try {
        await git(['checkout', branch], 60000);
      } catch (e) {
        return { ok: false, message: 'git checkout failed: ' + explain(e) };
      }
      try {
        await git(['pull', '--ff-only', '--quiet'], 120000);
      } catch (e) {
        return { ok: false, message: 'Switched to ' + branch + ' but git pull failed: ' + explain(e) };
      }
      const after = await git(['rev-parse', 'HEAD']);
      if (after === before) return { ok: true, changed: false, head: short(after), branch, message: 'Now on ' + branch + ' (same code).' };
      const result = await finish(before, after, 'Switched to ' + branch + ' (' + short(after) + ')', progress);
      return conflicts.length ? withStashNote(result, conflicts.length) : result;
    } finally {
      busy = false;
    }
  }

  return { run, switchChannel, version };
}
