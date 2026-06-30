const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

function resolvePort(preferredPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', (error) => {
      if (error && error.code === 'EADDRINUSE') {
        resolve(resolvePort(preferredPort + 1));
        return;
      }
      reject(error);
    });
    server.listen(preferredPort, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : preferredPort;
      server.close(() => resolve(port));
    });
  });
}

function waitForPort(port, retries = 60) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (retries <= 0) {
          reject(new Error(`Dev-Server auf Port ${port} wurde nicht rechtzeitig erreichbar.`));
          return;
        }
        retries -= 1;
        setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

async function main() {
  const port = await resolvePort(5173);
  const viteCli = path.join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
  const electronRunner = path.join(process.cwd(), 'scripts', 'run-electron.cjs');
  const env = { ...process.env, VITE_DEV_SERVER_URL: `http://127.0.0.1:${port}` };
  delete env.ELECTRON_RUN_AS_NODE;

  const vite = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: 'inherit',
    env
  });

  let electron = null;
  const shutdown = () => {
    if (electron && !electron.killed) electron.kill();
    if (!vite.killed) vite.kill();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  vite.on('exit', (code) => {
    if (electron && !electron.killed) electron.kill();
    process.exit(code ?? 0);
  });

  await waitForPort(port);

  electron = spawn(process.execPath, [electronRunner], {
    stdio: 'inherit',
    env
  });

  electron.on('exit', (code) => {
    if (!vite.killed) vite.kill();
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
