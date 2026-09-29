const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// POST /api/terminal/run
router.post('/run', (req, res) => {
  const { cmd, cwd } = req.body;
  if (!cmd || !cmd.trim()) {
    return res.status(400).json({ error: 'Command kosong!' });
  }

  const workdir = cwd && cwd.trim() ? cwd.trim() : undefined;

  const childEnv = Object.assign({}, process.env);
  delete childEnv.PORT;

  const options = {
    shell: 'cmd.exe',
    env: childEnv,
    timeout: 60000,
    maxBuffer: 1024 * 1024 * 5,
  };
  if (workdir) options.cwd = workdir;

  exec(cmd, options, (err, stdout, stderr) => {
    res.json({
      success: !err,
      stdout: stdout || '',
      stderr: stderr || '',
      error: err && !stderr ? err.message : '',
    });
  });
});

// POST /api/terminal/resolve-path
// Resolve path relatif/absolut dari cwd saat ini
router.post('/resolve-path', (req, res) => {
  const { target, cwd } = req.body;
  if (!target) return res.json({ error: 'Target path kosong' });

  let resolved;
  try {
    if (path.isAbsolute(target)) {
      resolved = path.normalize(target);
    } else {
      const base = cwd && cwd.trim() ? cwd.trim() : process.cwd();
      resolved = path.resolve(base, target);
    }

    if (!fs.existsSync(resolved)) {
      return res.json({ error: `Path tidak ditemukan: ${resolved}` });
    }
    if (!fs.statSync(resolved).isDirectory()) {
      return res.json({ error: `Bukan direktori: ${resolved}` });
    }

    res.json({ resolved });
  } catch (err) {
    res.json({ error: err.message });
  }
});

module.exports = router;
