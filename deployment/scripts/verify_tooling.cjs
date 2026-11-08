// Offline tooling checks only. Never import deploy.js or invoke entrypoint.sh.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const root = path.resolve(process.env.DEPLOYMENT_TOOLING_ROOT || path.join(__dirname, '../app'));
const load = createRequire(path.join(root, 'package.json'));

async function main() {
  const { ethers } = load('ethers');
  assert.match(ethers.version, /^ethers\/5\./);
  for (const pkg of ['contracts', 'contracts-upgradeable']) {
    assert.equal(load(`@openzeppelin/${pkg}/package.json`).version, '4.9.6');
  }
  // This publicly known key signs only an in-memory fixture, never a broadcast.
  const wallet = new ethers.Wallet(`0x${'0'.repeat(63)}1`);
  const signed = await wallet.signTransaction({ chainId: 1121, nonce: 0, gasLimit: 21000,
    gasPrice: 1, to: wallet.address, value: 0 });
  const decoded = ethers.utils.parseTransaction(signed);
  assert.equal(decoded.from, wallet.address);
  assert.equal(decoded.chainId, 1121);
  assert.equal(decoded.nonce, 0);
  const abi = new ethers.utils.Interface(['function owner() view returns (address)']);
  assert.equal(abi.encodeFunctionData('owner'), '0x8da5cb5b');
  assert.equal(ethers.utils.parseUnits('1.5', 18).toString(), '1500000000000000000');
  const data = load('js-yaml').load('version: 3\ncontracts: []\n');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'qbit-deployer-'));
  try {
    const file = path.join(scratch, 'fixture.json');
    load('fs-extra').writeJsonSync(file, data);
    assert.deepEqual(load('fs-extra').readJsonSync(file), { version: 3, contracts: [] });
    await checkWebSocket();
    if (process.argv.includes('--native')) compareNativeBuilds(scratch);
    console.log('Offline deployment tooling checks passed');
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}

async function checkWebSocket() {
  const { ethers } = load('ethers');
  const providerLoad = createRequire(load.resolve('@ethersproject/providers/package.json'));
  const { WebSocketServer } = providerLoad('ws');
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  server.on('connection', socket => socket.on('message', data => {
    const request = JSON.parse(data);
    const result = request.method === 'eth_chainId' ? '0x461' : '0x2a';
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
  }));
  const provider = new ethers.providers.WebSocketProvider(`ws://127.0.0.1:${server.address().port}`);
  try { assert.equal(await provider.getBlockNumber(), 42); }
  finally {
    await provider.destroy();
    for (const client of server.clients) client.terminate();
    await new Promise(resolve => server.close(resolve));
  }
}

function compareNativeBuilds(scratch) {
  assert.match(execFileSync('solc', ['--version'], { encoding: 'utf8' }), /Version: 0\.8\.28\+/);
  const outputs = [];
  for (const kind of ['baseline', 'candidate']) {
    const work = path.join(scratch, kind);
    const contracts = path.join(work, 'contracts');
    const modules = path.join(work, 'node_modules');
    const bundles = path.join(work, 'bundles');
    fs.mkdirSync(modules, { recursive: true });
    fs.cpSync('/source/contracts', contracts, { recursive: true });
    fs.cpSync(kind === 'baseline' ? '/baseline-openzeppelin' : path.join(root, 'node_modules/@openzeppelin'),
      path.join(modules, '@openzeppelin'), { recursive: true });
    execFileSync(process.execPath, [path.join(__dirname, 'bundle_contracts.cjs')], {
      env: { ...process.env, BUNDLE_SOURCE_DIR: contracts, MODULES_DIR: modules, CONTRACTS_DIR: bundles },
      stdio: 'pipe',
    });
    const files = fs.readdirSync(bundles).filter(name => name.endsWith('.sol')).sort();
    assert(files.length > 0);
    const result = execFileSync('solc', ['--optimize', '--optimize-runs', '200', '--evm-version', 'paris',
      '--combined-json', 'abi,bin,bin-runtime,storage-layout', ...files], {
      cwd: bundles, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    outputs.push(JSON.parse(result).contracts);
  }
  assert.deepEqual(outputs[1], outputs[0], 'Locked deployment dependencies changed native compiler artifacts');
  console.log(`Native solc artifacts identical for ${Object.keys(outputs[0]).length} bundled contracts`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
