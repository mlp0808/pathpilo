const { spawn } = require('child_process');
const net = require('net');

function isPortFreeOnHost(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

async function isPortFree(port) {
  // Next binds on both IPv4 and IPv6 on some platforms. We consider the port free
  // only if BOTH bindings are possible.
  const ipv4 = await isPortFreeOnHost(port, '0.0.0.0');
  const ipv6 = await isPortFreeOnHost(port, '::');
  return ipv4 && ipv6;
}

async function pickPort(preferredPorts) {
  for (const p of preferredPorts) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(p)) return p;
  }
  // fallback: scan a small range
  for (let p = 3000; p <= 3010; p++) {
    // Reserve 3003 for the Express API server.
    if (p === 3003) continue;
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(p)) return p;
  }
  return 3000;
}

async function main() {
  // Allow `npm run dev -- --port=3005`
  const cliPortArg = process.argv.find((a) => a.startsWith('--port='));
  const cliPort = cliPortArg ? parseInt(cliPortArg.split('=')[1], 10) : null;

  // Allow `npm run dev --port=3005` via npm_config_port
  const npmPort = process.env.npm_config_port ? parseInt(process.env.npm_config_port, 10) : null;

  const explicitPort = Number.isFinite(cliPort) ? cliPort : (Number.isFinite(npmPort) ? npmPort : null);
  const port = explicitPort || (await pickPort([3000, 3002]));

  console.log(`▶ Starting Next dev server on port ${port}...`);

  // Avoid relying on `npx` / shell specifics (can fail on Windows shells).
  // Run Next's CLI directly via Node.
  const nextBin = require.resolve('next/dist/bin/next');
  const child = spawn(
    process.execPath,
    [nextBin, 'dev', '-p', String(port)],
    { stdio: 'inherit', env: process.env }
  );

  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  console.error('Failed to start dev server:', e);
  process.exit(1);
});


