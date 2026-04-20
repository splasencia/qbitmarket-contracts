import dotenv from "dotenv";

import {
  loadVerificationManifest,
  resolveVerificationManifestPath,
} from "./statePaths.js";

dotenv.config();

const CONTRACTS_DIR = process.env.CONTRACTS_DIR;

function parseArgs(argv) {
  const options = {
    contract: null,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--contract") {
      options.contract = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (current === "--json") {
      options.json = true;
    }
  }

  return options;
}

function formatValue(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function main() {
  if (!CONTRACTS_DIR) {
    throw new Error("Missing environment variable: CONTRACTS_DIR");
  }

  const options = parseArgs(process.argv.slice(2));
  const manifestPath = resolveVerificationManifestPath(CONTRACTS_DIR);
  const manifest = loadVerificationManifest(CONTRACTS_DIR);
  const entries = Object.entries(manifest.contracts || {});
  const filteredEntries = options.contract
    ? entries.filter(([alias]) => alias === options.contract)
    : entries;

  if (filteredEntries.length === 0) {
    throw new Error(
      options.contract
        ? `No verification manifest entry found for contract alias: ${options.contract}`
        : `No verification entries found in ${manifestPath}`
    );
  }

  if (options.json) {
    const payload = {
      manifestPath,
      generatedAt: manifest.generatedAt || null,
      environment: manifest.environment || null,
      network: manifest.network || null,
      compiler: manifest.compiler || null,
      contracts: Object.fromEntries(filteredEntries),
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Verification manifest: ${manifestPath}`);
  if (manifest.environment) {
    console.log(`Environment: ${manifest.environment}`);
  }
  if (manifest.network?.chainId !== undefined && manifest.network?.chainId !== null) {
    console.log(`Network chainId: ${manifest.network.chainId}`);
  }

  for (const [alias, entry] of filteredEntries) {
    console.log("");
    console.log(`=== ${alias} ===`);
    console.log(`Address: ${entry.address || "n/a"}`);
    console.log(`Verification contract: ${entry.verificationContract || "n/a"}`);
    console.log(`Deploy block: ${entry.deployBlockNumber ?? "n/a"}`);
    console.log(`Constructor args: ${formatValue(entry.constructorArgs || [])}`);

    if (entry.initializer) {
      console.log(`Initializer function: ${entry.initializer.functionName || "n/a"}`);
      console.log(`Initializer args: ${formatValue(entry.initializer.args || [])}`);
      console.log(`Initializer calldata: ${entry.initializer.data || "n/a"}`);
    }

    if (entry.implementationAddress) {
      console.log(`Implementation address: ${entry.implementationAddress}`);
    }

    if (entry.proxyAdminAddress) {
      console.log(`Proxy admin address: ${entry.proxyAdminAddress}`);
    }

    if (entry.rolloutConfig) {
      console.log(`Rollout config: ${formatValue(entry.rolloutConfig)}`);
    }

    if (entry.postDeployConfiguration) {
      console.log(`Post-deploy configuration: ${formatValue(entry.postDeployConfiguration)}`);
    }
  }
}

main();
