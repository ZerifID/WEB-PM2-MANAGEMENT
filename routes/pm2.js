const express = require('express');
const router = express.Router();
const pm2 = require('pm2');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// ========================
// PM2 persistent connection
// ========================
let pm2Connected = false;

function ensurePM2Connected() {
  return new Promise((resolve, reject) => {
    if (pm2Connected) return resolve();
    pm2.connect(true, (err) => {
      if (err) return reject(err);
      pm2Connected = true;
      resolve();
    });
  });
}

// Reconnect kalau putus
pm2.on && pm2.on('close', () => { pm2Connected = false; });

function pm2List() {
  return new Promise((resolve, reject) => {
    pm2.list((err, list) => {
      if (err) reject(err);
      else resolve(list);
    });
  });
}

function pm2Action(action, id) {
  return new Promise((resolve, reject) => {
    pm2[action](id, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// GET /api/pm2/list
router.get('/list', async (req, res) => {
  try {
    await ensurePM2Connected();
    const list = await pm2List();
    const processes = list.map(p => ({
      id: p.pm_id,
      name: p.name,
      status: p.pm2_env.status,
      pid: p.pid,
      cpu: p.monit ? p.monit.cpu : 0,
      memory: p.monit ? p.monit.memory : 0,
      uptime: p.pm2_env.pm_uptime,
      restarts: p.pm2_env.restart_time,
      instances: p.pm2_env.instances || 1,
      exec_mode: p.pm2_env.exec_mode,
      script: p.pm2_env.pm_exec_path,
      cwd: p.pm2_env.pm_cwd,
      createdAt: p.pm2_env.created_at,
      version: p.pm2_env.version,
      node_version: p.pm2_env.node_version,
    }));
    res.json({ success: true, processes });
  } catch (err) {
    pm2Connected = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/pm2/start — jalankan via shell cmd persis seperti manual
router.post('/start', async (req, res) => {
  const { name, script, cwd, instances, max_memory_restart, watch, interpreter } = req.body;
  if (!script) return res.status(400).json({ error: 'Script wajib diisi!' });

  const args = [
    'pm2 start',
    interpreter ? `--interpreter "${interpreter}"` : '',
    `"${script}"`,
    name ? `--name "${name}"` : '',
    instances > 1 ? `-i ${instances}` : '',
    `--max-memory-restart ${max_memory_restart || '500M'}`,
    watch ? '--watch' : '',
  ].filter(Boolean).join(' ');

  const workdir = cwd ? path.resolve(cwd) : undefined;
  const command = workdir ? `cd /d "${workdir}" && ${args}` : args;

  const childEnv = Object.assign({}, process.env);
  delete childEnv.PORT;

  exec(command, { shell: 'cmd.exe', env: childEnv }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ success: false, error: stderr || err.message });
    res.json({ success: true, message: `Process "${name || script}" berhasil distart!` });
  });
});

// POST /api/pm2/stop/:id
router.post('/stop/:id', async (req, res) => {
  try {
    await ensurePM2Connected();
    await pm2Action('stop', req.params.id);
    res.json({ success: true, message: 'Process berhasil distop!' });
  } catch (err) {
    pm2Connected = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/pm2/restart/:id
router.post('/restart/:id', async (req, res) => {
  try {
    await ensurePM2Connected();
    await pm2Action('restart', req.params.id);
    res.json({ success: true, message: 'Process berhasil direstart!' });
  } catch (err) {
    pm2Connected = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/pm2/delete/:id
router.post('/delete/:id', async (req, res) => {
  try {
    await ensurePM2Connected();
    await pm2Action('delete', req.params.id);
    res.json({ success: true, message: 'Process berhasil dihapus!' });
  } catch (err) {
    pm2Connected = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/pm2/reload/:id
router.post('/reload/:id', async (req, res) => {
  try {
    await ensurePM2Connected();
    await pm2Action('reload', req.params.id);
    res.json({ success: true, message: 'Process berhasil direload!' });
  } catch (err) {
    pm2Connected = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/pm2/logs/:id
router.get('/logs/:id', async (req, res) => {
  try {
    await ensurePM2Connected();
    const list = await pm2List();
    const proc = list.find(p => String(p.pm_id) === String(req.params.id) || p.name === req.params.id);
    if (!proc) return res.status(404).json({ error: 'Process tidak ditemukan' });

    const lines = parseInt(req.query.lines) || 100;
    let stdout = '', stderr = '';

    if (proc.pm2_env.pm_out_log_path && fs.existsSync(proc.pm2_env.pm_out_log_path)) {
      stdout = fs.readFileSync(proc.pm2_env.pm_out_log_path, 'utf-8').split('\n').slice(-lines).join('\n');
    }
    if (proc.pm2_env.pm_err_log_path && fs.existsSync(proc.pm2_env.pm_err_log_path)) {
      stderr = fs.readFileSync(proc.pm2_env.pm_err_log_path, 'utf-8').split('\n').slice(-lines).join('\n');
    }

    res.json({ success: true, stdout, stderr, name: proc.name });
  } catch (err) {
    pm2Connected = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/pm2/flush/:id
router.post('/flush/:id', async (req, res) => {
  try {
    await ensurePM2Connected();
    await new Promise((resolve, reject) => {
      pm2.flush(req.params.id, (err) => { if (err) reject(err); else resolve(); });
    });
    res.json({ success: true, message: 'Logs berhasil di-flush!' });
  } catch (err) {
    pm2Connected = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/pm2/info/:id
router.get('/info/:id', async (req, res) => {
  try {
    await ensurePM2Connected();
    const list = await pm2List();
    const proc = list.find(p => String(p.pm_id) === String(req.params.id) || p.name === req.params.id);
    if (!proc) return res.status(404).json({ error: 'Process tidak ditemukan' });
    res.json({ success: true, process: proc });
  } catch (err) {
    pm2Connected = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/pm2/save
router.post('/save', async (req, res) => {
  try {
    await ensurePM2Connected();
    await new Promise((resolve, reject) => {
      pm2.dump((err) => { if (err) reject(err); else resolve(); });
    });
    res.json({ success: true, message: 'PM2 list berhasil disave!' });
  } catch (err) {
    pm2Connected = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
