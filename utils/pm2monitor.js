const pm2 = require('pm2');
const os = require('os');

let monitorInterval = null;
let busConnected = false;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getSystemStats() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  let totalIdle = 0, totalTick = 0;
  cpus.forEach(cpu => {
    for (const type in cpu.times) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  });
  const cpuUsage = 100 - Math.floor((100 * totalIdle) / totalTick);

  return {
    cpu: cpuUsage,
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percent: Math.round((usedMem / totalMem) * 100),
      totalFormatted: formatBytes(totalMem),
      usedFormatted: formatBytes(usedMem),
      freeFormatted: formatBytes(freeMem),
    },
    uptime: os.uptime(),
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || 'Unknown',
  };
}

function startPM2Monitor(broadcast) {
  // Koneksi sekali, persistent
  pm2.connect(true, (err) => {
    if (err) {
      console.error('PM2 monitor connect error:', err.message);
      return;
    }

    console.log('✅ PM2 monitor connected');

    // Bus untuk realtime events + logs
    if (!busConnected) {
      pm2.launchBus((err, bus) => {
        if (err) {
          console.error('PM2 bus error:', err.message);
          return;
        }
        busConnected = true;

        bus.on('process:event', (data) => {
          broadcast({ type: 'process_event', data });
        });

        bus.on('log:out', (data) => {
          broadcast({
            type: 'log_out',
            processName: data.process?.name,
            pm_id: data.process?.pm_id,
            data: data.data,
          });
        });

        bus.on('log:err', (data) => {
          broadcast({
            type: 'log_err',
            processName: data.process?.name,
            pm_id: data.process?.pm_id,
            data: data.data,
          });
        });
      });
    }

    // Poll list + system stats tiap 3 detik
    monitorInterval = setInterval(() => {
      pm2.list((err, list) => {
        if (err) return;

        const processes = list.map(p => ({
          id: p.pm_id,
          name: p.name,
          status: p.pm2_env.status,
          pid: p.pid,
          cpu: p.monit ? p.monit.cpu : 0,
          memory: p.monit ? p.monit.memory : 0,
          memoryFormatted: formatBytes(p.monit ? p.monit.memory : 0),
          uptime: p.pm2_env.pm_uptime,
          restarts: p.pm2_env.restart_time,
          instances: p.pm2_env.instances || 1,
          exec_mode: p.pm2_env.exec_mode,
          script: p.pm2_env.pm_exec_path,
          cwd: p.pm2_env.pm_cwd,
        }));

        broadcast({
          type: 'stats_update',
          processes,
          system: getSystemStats(),
          timestamp: Date.now(),
        });
      });
    }, 3000);
  });
}

function stopPM2Monitor() {
  if (monitorInterval) clearInterval(monitorInterval);
}

module.exports = { startPM2Monitor, stopPM2Monitor };
