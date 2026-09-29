// =====================
// PM2 Manager Frontend
// =====================

const API = '/api';
let token = localStorage.getItem('pm2_token');
let currentUser = JSON.parse(localStorage.getItem('pm2_user') || 'null');
let ws = null;
let wsReconnectTimer = null;
let currentPage = 'dashboard';
let processesData = [];
let systemData = {};
let activeLogProcessId = null;
let logLines = [];

// ========================
// INIT
// ========================
document.addEventListener('DOMContentLoaded', () => {
  if (token) {
    verifyAndEnter();
  } else {
    showLogin();
  }
  setupLoginForm();
  setupNavigation();
  setupTopbarTime();
  setupMobileMenu();
  setupSidebarToggle();
  setupProcessButtons();
  setupDeployForm();
  setupChangePassForm();
  setupLogControls();
  setupModal();
  setupRuntimeSelector();
  setupTerminal();
});

// ========================
// AUTH
// ========================
function setupLoginForm() {
  const form = document.getElementById('loginForm');
  const toggleBtn = document.getElementById('togglePass');
  const passInput = document.getElementById('loginPassword');

  toggleBtn.addEventListener('click', () => {
    if (passInput.type === 'password') {
      passInput.type = 'text';
      toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
      passInput.type = 'password';
      toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const loginBtn = document.getElementById('loginBtn');
    const errEl = document.getElementById('loginError');
    errEl.style.display = 'none';
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login gagal!');

      token = data.token;
      currentUser = data.user;
      localStorage.setItem('pm2_token', token);
      localStorage.setItem('pm2_user', JSON.stringify(currentUser));
      enterApp();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
    }
  });
}

async function verifyAndEnter() {
  try {
    const res = await fetch(`${API}/auth/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.valid) {
      currentUser = data.user;
      enterApp();
    } else {
      logout();
    }
  } catch {
    logout();
  }
}

function enterApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('mainApp').style.display = 'flex';
  document.getElementById('userLabel').textContent = currentUser?.username || 'admin';
  connectWS();
  navigateTo('dashboard');
}

function showLogin() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('mainApp').style.display = 'none';
}

function logout() {
  localStorage.removeItem('pm2_token');
  localStorage.removeItem('pm2_user');
  token = null;
  currentUser = null;
  if (ws) ws.close();
  showLogin();
}

document.getElementById('logoutBtn').addEventListener('click', logout);

// ========================
// WEBSOCKET
// ========================
function connectWS() {
  if (ws) ws.close();
  clearTimeout(wsReconnectTimer);

  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}?token=${token}`;
  ws = new WebSocket(wsUrl);
  setWsStatus('connecting');

  ws.addEventListener('open', () => {
    setWsStatus('connected');
  });

  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      handleWsMessage(msg);
    } catch {}
  });

  ws.addEventListener('close', () => {
    setWsStatus('error');
    wsReconnectTimer = setTimeout(connectWS, 4000);
  });

  ws.addEventListener('error', () => {
    setWsStatus('error');
  });
}

function setWsStatus(state) {
  const dot = document.getElementById('wsStatus').querySelector('.ws-dot');
  const label = document.getElementById('wsStatus').querySelector('.ws-label');
  dot.className = 'ws-dot';
  if (state === 'connected') {
    dot.classList.add('connected');
    label.textContent = 'Connected';
  } else if (state === 'connecting') {
    dot.classList.add('connecting');
    label.textContent = 'Connecting...';
  } else {
    dot.classList.add('error');
    label.textContent = 'Disconnected';
  }
}

function handleWsMessage(msg) {
  if (msg.type === 'stats_update') {
    processesData = msg.processes || [];
    systemData = msg.system || {};
    updateDashboard();
    updateProcessTable();
    updateLogSelect();
  }
  if (msg.type === 'process_event') {
    fetchProcessList();
  }
  if (msg.type === 'log_out' || msg.type === 'log_err') {
    if (String(msg.pm_id) === String(activeLogProcessId) || msg.processName === activeLogProcessId) {
      appendLog(msg.data, msg.type === 'log_err' ? 'err' : 'out');
    }
  }
  // PTY output
  if (msg.type === 'pty_output' || msg.type === 'pty_exit') {
    handlePtyOutput(msg);
  }
}

// ========================
// NAVIGATION
// ========================
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page) navigateTo(page);
      // Close mobile sidebar
      document.getElementById('sidebar').classList.remove('mobile-open');
    });
  });
}

function navigateTo(page) {
  currentPage = page;
  const titles = { dashboard: 'Dashboard', processes: 'Processes', logs: 'Logs', deploy: 'Deploy', settings: 'Settings' };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  if (page === 'logs') {
    updateLogSelect();
    if (!activeLogProcessId && processesData.length > 0) {
      loadLogsFor(processesData[0].id);
    }
  }
  if (page === 'terminal') {
    // Auto-connect xterm saat halaman dibuka
    setTimeout(() => initXterm(), 100);
  }
}

// ========================
// SIDEBAR + MOBILE
// ========================
function setupSidebarToggle() {
  const sidebar = document.getElementById('sidebar');

  // Tombol ☰ = toggle collapse/expand di desktop
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    if (window.innerWidth > 768) {
      sidebar.classList.toggle('collapsed');
    }
  });

  // Klik logo ⚡ saat collapsed = expand lagi
  document.querySelector('.sidebar-logo').addEventListener('click', () => {
    if (window.innerWidth > 768 && sidebar.classList.contains('collapsed')) {
      sidebar.classList.remove('collapsed');
    }
  });
}

function setupMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  function openMobileSidebar() {
    sidebar.classList.add('mobile-open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileSidebar() {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  // Hamburger button — toggle open/close
  document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    if (sidebar.classList.contains('mobile-open')) {
      closeMobileSidebar();
    } else {
      openMobileSidebar();
    }
  });

  // Klik overlay gelap = tutup
  overlay.addEventListener('click', closeMobileSidebar);

  // Klik nav item di mobile = tutup sidebar
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeMobileSidebar();
    });
  });

  // Resize dari mobile ke desktop = reset state mobile
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      closeMobileSidebar();
    }
  });
}

// ========================
// CLOCK
// ========================
function setupTopbarTime() {
  const el = document.getElementById('topbarTime');
  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  tick();
  setInterval(tick, 1000);
}

// ========================
// FETCH PROCESS LIST (fallback)
// ========================
async function fetchProcessList() {
  try {
    const res = await authFetch(`${API}/pm2/list`);
    const data = await res.json();
    if (data.success) {
      processesData = data.processes;
      updateDashboard();
      updateProcessTable();
      updateLogSelect();
    }
  } catch {}
}

// ========================
// DASHBOARD
// ========================
function updateDashboard() {
  const sys = systemData;
  if (!sys || !sys.cpu && sys.cpu !== 0) return;

  // Stats
  setEl('sysCpu', (sys.cpu || 0) + '%');
  setEl('sysMem', (sys.memory?.percent || 0) + '%');
  setBar('sysCpuBar', sys.cpu || 0);
  setBar('sysMemBar', sys.memory?.percent || 0);
  setEl('sysMemDetail', `${sys.memory?.usedFormatted || '-'} / ${sys.memory?.totalFormatted || '-'}`);

  const online = processesData.filter(p => p.status === 'online').length;
  const stopped = processesData.filter(p => p.status !== 'online').length;
  setEl('countOnline', online);
  setEl('countStopped', stopped);
  document.getElementById('processCount').textContent = processesData.length;

  // System info
  setEl('siHostname', sys.hostname || '-');
  setEl('siPlatform', sys.platform || '-');
  setEl('siCpuModel', (sys.cpuModel || '-').substring(0, 40));
  setEl('siCpuCount', sys.cpuCount || '-');
  setEl('siTotalMem', sys.memory?.totalFormatted || '-');
  setEl('siUptime', formatUptime(sys.uptime * 1000));

  // Dashboard process table
  renderProcessTable('dashProcessList', processesData, true);
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setBar(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = Math.min(100, pct) + '%';
}

// ========================
// PROCESS TABLE
// ========================
function updateProcessTable() {
  renderProcessTable('fullProcessList', processesData, false);
}

function renderProcessTable(containerId, processes, compact) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!processes.length) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-ghost"></i><p>Belum ada proses</p></div>`;
    return;
  }

  const rows = processes.map(p => `
    <tr>
      <td><span class="proc-id">${p.id}</span></td>
      <td><span class="proc-name">${escHtml(p.name || '-')}</span></td>
      <td>${statusBadge(p.status)}</td>
      <td>${formatBytes(p.memory || 0)}</td>
      <td>${(p.cpu || 0).toFixed(1)}%</td>
      <td>${p.restarts || 0}</td>
      ${!compact ? `<td>${p.pid || '-'}</td><td>${formatUptime(Date.now() - (p.uptime || Date.now()))}</td>` : ''}
      <td>
        <div class="action-btns">
          ${p.status !== 'online' ? `<button class="action-btn start" title="Start" onclick="procAction('start','${p.id}')"><i class="fas fa-play"></i></button>` : ''}
          ${p.status === 'online' ? `<button class="action-btn stop" title="Stop" onclick="procAction('stop','${p.id}')"><i class="fas fa-stop"></i></button>` : ''}
          <button class="action-btn restart" title="Restart" onclick="procAction('restart','${p.id}')"><i class="fas fa-redo"></i></button>
          <button class="action-btn reload" title="Reload" onclick="procAction('reload','${p.id}')"><i class="fas fa-sync"></i></button>
          <button class="action-btn logs" title="Logs" onclick="openLogs('${p.id}')"><i class="fas fa-terminal"></i></button>
          <button class="action-btn" title="Info" onclick="openInfo('${p.id}')"><i class="fas fa-info-circle"></i></button>
          <button class="action-btn delete" title="Delete" onclick="procDelete('${p.id}','${escHtml(p.name)}')"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');

  const headers = compact
    ? `<th>ID</th><th>Name</th><th>Status</th><th>Memory</th><th>CPU</th><th>Restarts</th><th>Actions</th>`
    : `<th>ID</th><th>Name</th><th>Status</th><th>Memory</th><th>CPU</th><th>Restarts</th><th>PID</th><th>Uptime</th><th>Actions</th>`;

  container.innerHTML = `
    <table class="proc-table">
      <thead><tr>${headers}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function statusBadge(status) {
  const map = {
    online: 'status-online',
    stopped: 'status-stopped',
    stopping: 'status-stopping',
    errored: 'status-errored',
    launching: 'status-launching',
  };
  const cls = map[status] || 'status-unknown';
  const icon = status === 'online' ? 'fa-circle-check' : status === 'errored' ? 'fa-triangle-exclamation' : 'fa-circle';
  return `<span class="status-badge ${cls}"><i class="fas ${icon}"></i>${status || 'unknown'}</span>`;
}

// ========================
// PROCESS ACTIONS
// ========================
async function procAction(action, id) {
  try {
    const res = await authFetch(`${API}/pm2/${action}/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      toast(data.message || 'Sukses!', 'success');
      setTimeout(fetchProcessList, 800);
    } else {
      toast(data.error || 'Gagal!', 'error');
    }
  } catch (err) {
    toast('Koneksi error: ' + err.message, 'error');
  }
}

function procDelete(id, name) {
  showConfirmModal(
    `Delete Process`,
    `<p>Yakin mau hapus process <strong>${escHtml(name)}</strong> (ID: ${id})?</p><p style="color:var(--danger);margin-top:8px;">⚠️ Action ini tidak bisa di-undo!</p>`,
    async () => {
      await procAction('delete', id);
      closeModal();
    }
  );
}

// ========================
// LOGS
// ========================
function setupLogControls() {
  document.getElementById('logProcessSelect').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) loadLogsFor(val);
  });
  document.getElementById('clearLogBtn').addEventListener('click', () => {
    logLines = [];
    document.getElementById('logTerminal').innerHTML = '<div class="log-placeholder"><i class="fas fa-terminal"></i> Log cleared...</div>';
  });
  document.getElementById('flushLogBtn').addEventListener('click', async () => {
    if (!activeLogProcessId) return toast('Pilih process dulu!', 'warning');
    const res = await authFetch(`${API}/pm2/flush/${activeLogProcessId}`, { method: 'POST' });
    const data = await res.json();
    toast(data.message || 'Flushed!', data.success ? 'success' : 'error');
  });
}

function updateLogSelect() {
  const sel = document.getElementById('logProcessSelect');
  const cur = sel.value;
  sel.innerHTML = '<option value="">-- Pilih Process --</option>' +
    processesData.map(p => `<option value="${p.id}" ${String(p.id) === String(cur) ? 'selected' : ''}>${escHtml(p.name)} (${p.id})</option>`).join('');
}

async function loadLogsFor(id) {
  activeLogProcessId = id;
  document.getElementById('logProcessSelect').value = id;
  logLines = [];
  const terminal = document.getElementById('logTerminal');
  terminal.innerHTML = '<div class="log-placeholder"><i class="fas fa-spinner fa-spin"></i> Loading logs...</div>';

  try {
    const res = await authFetch(`${API}/pm2/logs/${id}?lines=200`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal load logs');

    terminal.innerHTML = '';
    if (data.stdout) {
      data.stdout.split('\n').forEach(line => line && appendLog(line, 'out', false));
    }
    if (data.stderr) {
      data.stderr.split('\n').forEach(line => line && appendLog(line, 'err', false));
    }
    scrollLogToBottom();
  } catch (err) {
    terminal.innerHTML = `<div class="log-placeholder" style="color:var(--danger)"><i class="fas fa-exclamation-triangle"></i> ${escHtml(err.message)}</div>`;
  }
}

function appendLog(text, type = 'out', scroll = true) {
  const showErr = document.getElementById('showErrLog')?.checked !== false;
  const showOut = document.getElementById('showOutLog')?.checked !== false;
  if (type === 'err' && !showErr) return;
  if (type === 'out' && !showOut) return;

  const terminal = document.getElementById('logTerminal');
  const placeholder = terminal.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();

  const ts = new Date().toLocaleTimeString('id-ID');
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.innerHTML = `<span class="log-ts">[${ts}]</span>${escHtml(text)}`;
  terminal.appendChild(line);

  // Limit lines
  logLines.push(line);
  if (logLines.length > 2000) {
    const old = logLines.shift();
    old.remove();
  }

  if (scroll && document.getElementById('autoScrollLog')?.checked !== false) {
    scrollLogToBottom();
  }
}

function scrollLogToBottom() {
  const t = document.getElementById('logTerminal');
  t.scrollTop = t.scrollHeight;
}

function openLogs(id) {
  activeLogProcessId = id;
  navigateTo('logs');
  loadLogsFor(id);
}

// ========================
// PROCESS INFO MODAL
// ========================
async function openInfo(id) {
  try {
    const res = await authFetch(`${API}/pm2/info/${id}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    const p = data.process;
    const env = p.pm2_env;

    showModal(`Process Info: ${escHtml(p.name)}`, `
      <table class="detail-table">
        <tr><td>ID</td><td>${p.pm_id}</td></tr>
        <tr><td>Name</td><td>${escHtml(p.name)}</td></tr>
        <tr><td>Status</td><td>${statusBadge(env.status)}</td></tr>
        <tr><td>PID</td><td>${p.pid || '-'}</td></tr>
        <tr><td>Script</td><td>${escHtml(env.pm_exec_path || '-')}</td></tr>
        <tr><td>CWD</td><td>${escHtml(env.pm_cwd || '-')}</td></tr>
        <tr><td>Exec Mode</td><td>${env.exec_mode || '-'}</td></tr>
        <tr><td>Instances</td><td>${env.instances || 1}</td></tr>
        <tr><td>Restarts</td><td>${env.restart_time || 0}</td></tr>
        <tr><td>Uptime</td><td>${formatUptime(Date.now() - (env.pm_uptime || Date.now()))}</td></tr>
        <tr><td>Memory</td><td>${formatBytes(p.monit?.memory || 0)}</td></tr>
        <tr><td>CPU</td><td>${(p.monit?.cpu || 0).toFixed(1)}%</td></tr>
        <tr><td>Node Ver</td><td>${env.node_version || '-'}</td></tr>
        <tr><td>Stdout Log</td><td>${escHtml(env.pm_out_log_path || '-')}</td></tr>
        <tr><td>Stderr Log</td><td>${escHtml(env.pm_err_log_path || '-')}</td></tr>
        <tr><td>Created At</td><td>${env.created_at ? new Date(env.created_at).toLocaleString('id-ID') : '-'}</td></tr>
      </table>
    `);
  } catch (err) {
    toast('Gagal load info: ' + err.message, 'error');
  }
}

// ========================
// DEPLOY FORM
// ========================
function setupProcessButtons() {
  document.getElementById('startProcessBtn')?.addEventListener('click', () => navigateTo('deploy'));
  document.getElementById('dashStartBtn')?.addEventListener('click', () => navigateTo('deploy'));
  document.getElementById('saveBtn')?.addEventListener('click', async () => {
    const res = await authFetch(`${API}/pm2/save`, { method: 'POST' });
    const data = await res.json();
    toast(data.message || 'Saved!', data.success ? 'success' : 'error');
  });
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    fetchProcessList();
    toast('Refreshed!', 'info');
  });
}

function setupDeployForm() {
  document.getElementById('deployForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultEl = document.getElementById('deployResult');
    resultEl.style.display = 'none';

    const runtime = document.getElementById('depRuntime').value;
    const name = document.getElementById('depName').value.trim();
    const cwd = document.getElementById('depCwd').value.trim();
    const instances = parseInt(document.getElementById('depInstances').value) || 1;
    const max_memory_restart = document.getElementById('depMaxMem').value.trim() || '500M';
    const watch = document.getElementById('depWatch').checked;

    let script = '';
    let interpreter = '';

    if (runtime === 'node') {
      script = document.getElementById('depScript').value.trim();
      if (!script) { toast('Script wajib diisi!', 'error'); return; }
    } else if (runtime === 'python') {
      script = document.getElementById('depPyScript').value.trim();
      const pyPath = document.getElementById('depPyPath').value.trim() || 'python';
      interpreter = pyPath;
      if (!script) { toast('Script Python wajib diisi!', 'error'); return; }
    } else if (runtime === 'custom') {
      interpreter = document.getElementById('depCustomInterp').value.trim();
      script = document.getElementById('depCustomScript').value.trim();
      if (!interpreter || !script) { toast('Interpreter dan Script wajib diisi!', 'error'); return; }
    }

    try {
      const res = await authFetch(`${API}/pm2/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, name: name || undefined, cwd: cwd || undefined, instances, max_memory_restart, watch, interpreter: interpreter || undefined }),
      });
      const data = await res.json();
      resultEl.className = `alert ${data.success ? 'alert-success' : 'alert-danger'}`;
      resultEl.textContent = data.message || data.error;
      resultEl.style.display = 'block';
      if (data.success) {
        setTimeout(fetchProcessList, 1000);
        toast('Process berhasil distart!', 'success');
      }
    } catch (err) {
      resultEl.className = 'alert alert-danger';
      resultEl.textContent = 'Error: ' + err.message;
      resultEl.style.display = 'block';
    }
  });
}

// ========================
// TERMINAL XTERM
// ========================
let xtermInstance = null;
let fitAddon = null;
let ptyConnected = false;

function setupTerminal() {
  // Connect otomatis saat halaman terminal dibuka
  document.getElementById('termConnectBtn')?.addEventListener('click', () => {
    initXterm();
  });

  document.getElementById('termKillBtn')?.addEventListener('click', () => {
    if (ws && ptyConnected) {
      ws.send(JSON.stringify({ type: 'pty_kill' }));
      ptyConnected = false;
      if (xtermInstance) xtermInstance.writeln('\r\n\x1b[33m[Terminal disconnected]\x1b[0m');
    }
  });
}

function initXterm() {
  const container = document.getElementById('xtermContainer');
  if (!container) return;

  // Kill PTY lama di server dulu sebelum bikin baru
  if (ws && ws.readyState === WebSocket.OPEN && ptyConnected) {
    ws.send(JSON.stringify({ type: 'pty_kill' }));
  }
  ptyConnected = false;

  // Dispose xterm lama
  if (xtermInstance) {
    xtermInstance.dispose();
    xtermInstance = null;
  }
  container.innerHTML = '';

  // Init xterm
  xtermInstance = new Terminal({
    theme: {
      background: '#0a0d14',
      foreground: '#c9d1d9',
      cursor: '#6366f1',
      selectionBackground: 'rgba(99,102,241,0.3)',
      black: '#0a0d14',
      red: '#f87171',
      green: '#22c55e',
      yellow: '#f59e0b',
      blue: '#6366f1',
      magenta: '#a78bfa',
      cyan: '#22d3ee',
      white: '#e2e8f0',
      brightBlack: '#64748b',
      brightRed: '#fca5a5',
      brightGreen: '#86efac',
      brightYellow: '#fcd34d',
      brightBlue: '#818cf8',
      brightMagenta: '#c4b5fd',
      brightCyan: '#67e8f9',
      brightWhite: '#f8fafc',
    },
    fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace",
    fontSize: 14,
    lineHeight: 1.4,
    cursorBlink: true,
    scrollback: 5000,
    allowTransparency: false,
  });

  fitAddon = new FitAddon.FitAddon();
  xtermInstance.loadAddon(fitAddon);
  xtermInstance.open(container);
  fitAddon.fit();

  // Resize observer
  const ro = new ResizeObserver(() => { if (fitAddon) fitAddon.fit(); });
  ro.observe(container);

  xtermInstance.writeln('\x1b[32mConnecting to terminal...\x1b[0m');

  // Pastiin WS connected, lalu kirim pty_start
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    xtermInstance.writeln('\x1b[31mWebSocket tidak terhubung! Refresh halaman dulu.\x1b[0m');
    return;
  }

  const cwd = document.getElementById('termCwdInput')?.value.trim() || '';
  ws.send(JSON.stringify({
    type: 'pty_start',
    cols: xtermInstance.cols,
    rows: xtermInstance.rows,
    cwd,
  }));
  ptyConnected = true;

  // Kirim input dari xterm ke PTY
  xtermInstance.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN && ptyConnected) {
      ws.send(JSON.stringify({ type: 'pty_input', data }));
    }
  });

  // Resize
  xtermInstance.onResize(({ cols, rows }) => {
    if (ws && ws.readyState === WebSocket.OPEN && ptyConnected) {
      ws.send(JSON.stringify({ type: 'pty_resize', cols, rows }));
    }
  });
}

// Handle pesan PTY dari server (di handleWsMessage)
function handlePtyOutput(msg) {
  if (msg.type === 'pty_output' && xtermInstance) {
    xtermInstance.write(msg.data);
  }
  if (msg.type === 'pty_exit' && xtermInstance) {
    xtermInstance.writeln(`\r\n\x1b[33m[Process exited with code ${msg.exitCode}]\x1b[0m`);
    ptyConnected = false;
  }
}
function setupRuntimeSelector() {
  const runtime = document.getElementById('depRuntime');
  if (!runtime) return;
  runtime.addEventListener('change', () => {
    document.getElementById('optNode').style.display = runtime.value === 'node' ? '' : 'none';
    document.getElementById('optPython').style.display = runtime.value === 'python' ? '' : 'none';
    document.getElementById('optCustom').style.display = runtime.value === 'custom' ? '' : 'none';
  });
}

// ========================
// TERMINAL
// ========================
let termCwd = '';
let termHistory = [];
let termHistoryIdx = -1;

function setupTerminal() {
  const input = document.getElementById('termInput');
  const sendBtn = document.getElementById('termSendBtn');
  const clearBtn = document.getElementById('termClearBtn');
  const setCwdBtn = document.getElementById('termSetCwdBtn');

  if (!input) return;

  sendBtn.addEventListener('click', () => runTermCommand());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runTermCommand(); }
    // History up/down
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (termHistoryIdx < termHistory.length - 1) {
        termHistoryIdx++;
        input.value = termHistory[termHistory.length - 1 - termHistoryIdx] || '';
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (termHistoryIdx > 0) {
        termHistoryIdx--;
        input.value = termHistory[termHistory.length - 1 - termHistoryIdx] || '';
      } else {
        termHistoryIdx = -1;
        input.value = '';
      }
    }
  });

  clearBtn.addEventListener('click', () => {
    document.getElementById('termOutput').innerHTML = '<div class="log-placeholder"><i class="fas fa-terminal"></i> Cleared.</div>';
  });

  setCwdBtn.addEventListener('click', () => {
    const val = document.getElementById('termCwdInput').value.trim();
    termCwd = val;
    const prompt = document.getElementById('termPrompt');
    if (prompt) prompt.textContent = val ? `${val}>` : '$';
    toast(`Working directory diset ke: ${val || '(default)'}`, 'info');
  });
}

async function runTermCommand() {
  const input = document.getElementById('termInput');
  const cmd = input.value.trim();
  if (!cmd) return;

  input.value = '';
  termHistory.push(cmd);
  termHistoryIdx = -1;

  const cwdInput = document.getElementById('termCwdInput');
  const prompt = document.getElementById('termPrompt');

  // Handle "cd" secara lokal — update cwd tanpa kirim ke server
  if (/^cd(\s|$)/i.test(cmd)) {
    const targetRaw = cmd.slice(2).trim();
    if (!targetRaw) {
      termCwd = '';
      cwdInput.value = '';
      prompt.textContent = '$';
      termAppendLine(`<span style="color:var(--text3);">Directory direset ke default</span>`);
    } else {
      try {
        const res = await authFetch('/api/terminal/resolve-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: targetRaw, cwd: termCwd }),
        });
        const data = await res.json();
        if (data.resolved) {
          termCwd = data.resolved;
          cwdInput.value = termCwd;
          prompt.textContent = `${termCwd}>`;
          termAppendLine(`<span style="color:var(--text3);">&#x276F; cd ${escHtml(termCwd)}</span>`);
        } else {
          termAppendLine(`<span style="color:var(--danger);">cd: ${escHtml(data.error || 'Path tidak ditemukan')}</span>`);
        }
      } catch (err) {
        termAppendLine(`<span style="color:var(--danger);">cd error: ${escHtml(err.message)}</span>`);
      }
    }
    return;
  }

  const cwd = termCwd || cwdInput?.value.trim() || '';
  termAppendLine(`<span style="color:var(--primary-light);">&#x276F; ${escHtml(cmd)}</span>`);

  try {
    const res = await authFetch('/api/terminal/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd, cwd }),
    });
    const data = await res.json();
    if (data.stdout) {
      data.stdout.split('\n').forEach(line => line && termAppendLine(escHtml(line)));
    }
    if (data.stderr) {
      data.stderr.split('\n').forEach(line => line && termAppendLine(`<span style="color:var(--danger);">${escHtml(line)}</span>`));
    }
    if (data.error) {
      termAppendLine(`<span style="color:var(--danger);">Error: ${escHtml(data.error)}</span>`);
    }
    if (!data.stdout && !data.stderr && !data.error) {
      termAppendLine('<span style="color:var(--text3);">&#x2713; Done (no output)</span>');
    }
  } catch (err) {
    termAppendLine(`<span style="color:var(--danger);">Koneksi error: ${escHtml(err.message)}</span>`);
  }
}

function termAppendLine(html) {
  const output = document.getElementById('termOutput');
  const placeholder = output.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();

  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = html;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}
function setupChangePassForm() {
  document.getElementById('changePassForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultEl = document.getElementById('passResult');
    const oldPass = document.getElementById('oldPass').value;
    const newPass = document.getElementById('newPass').value;
    const confirmPass = document.getElementById('confirmPass').value;

    if (newPass !== confirmPass) {
      resultEl.className = 'alert alert-danger';
      resultEl.textContent = 'Password baru tidak cocok!';
      resultEl.style.display = 'block';
      return;
    }

    try {
      const res = await authFetch(`${API}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: oldPass, newPassword: newPass }),
      });
      const data = await res.json();
      resultEl.className = `alert ${res.ok ? 'alert-success' : 'alert-danger'}`;
      resultEl.textContent = data.message || data.error;
      resultEl.style.display = 'block';
      if (res.ok) {
        document.getElementById('changePassForm').reset();
        toast('Password berhasil diubah!', 'success');
      }
    } catch (err) {
      resultEl.className = 'alert alert-danger';
      resultEl.textContent = 'Error: ' + err.message;
      resultEl.style.display = 'block';
    }
  });
}

// ========================
// MODAL
// ========================
function setupModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
}

function showModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').style.display = 'flex';
}

function showConfirmModal(title, bodyHtml, onConfirm) {
  const html = `
    ${bodyHtml}
    <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">
      <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
      <button class="btn btn-danger" id="confirmActionBtn"><i class="fas fa-trash"></i> Ya, Hapus!</button>
    </div>`;
  showModal(title, html);
  setTimeout(() => {
    document.getElementById('confirmActionBtn')?.addEventListener('click', onConfirm);
  }, 50);
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

// ========================
// TOAST
// ========================
function toast(message, type = 'info') {
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const colors = { success: 'var(--success)', error: 'var(--danger)', warning: 'var(--warning)', info: 'var(--info)' };
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fas ${icons[type] || icons.info}" style="color:${colors[type]};"></i><span>${escHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ========================
// HELPERS
// ========================
async function authFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(ms) {
  if (!ms || ms < 0) return '-';
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + (s % 60) + 's';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ' + (m % 60) + 'm';
  const d = Math.floor(h / 24);
  return d + 'd ' + (h % 24) + 'h';
}

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
