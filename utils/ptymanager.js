const pty = require('node-pty');
const os = require('os');

const shell = os.platform() === 'win32' ? 'cmd.exe' : (process.env.SHELL || 'bash');
const defaultCwd = process.env.HOME || process.env.USERPROFILE || (os.platform() === 'win32' ? 'C:\\' : '/root');

const ptySessions = new Map(); // wsId -> ptyProcess

function createPtySession(wsId, ws, cols = 120, rows = 30, cwd) {
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols,
    rows,
    cwd: cwd || defaultCwd,
    env: Object.assign({}, process.env, {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    }),
  });

  ptyProcess.onData((data) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'pty_output', data }));
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'pty_exit', exitCode }));
    }
    ptySessions.delete(wsId);
  });

  ptySessions.set(wsId, ptyProcess);
  return ptyProcess;
}

function handlePtyMessage(wsId, ws, msg) {
  try {
    const parsed = JSON.parse(msg);

    if (parsed.type === 'pty_start') {
      // Kill sesi lama kalau ada
      if (ptySessions.has(wsId)) {
        try { ptySessions.get(wsId).kill(); } catch {}
        ptySessions.delete(wsId);
      }
      createPtySession(wsId, ws, parsed.cols || 120, parsed.rows || 30, parsed.cwd || defaultCwd);
    }

    if (parsed.type === 'pty_input') {
      const proc = ptySessions.get(wsId);
      if (proc) proc.write(parsed.data);
    }

    if (parsed.type === 'pty_resize') {
      const proc = ptySessions.get(wsId);
      if (proc) proc.resize(parsed.cols, parsed.rows);
    }

    if (parsed.type === 'pty_kill') {
      const proc = ptySessions.get(wsId);
      if (proc) {
        try { proc.kill(); } catch {}
        ptySessions.delete(wsId);
      }
    }
  } catch (e) {}
}

function closePtySession(wsId) {
  if (ptySessions.has(wsId)) {
    try { ptySessions.get(wsId).kill(); } catch {}
    ptySessions.delete(wsId);
  }
}

module.exports = { handlePtyMessage, closePtySession };
