#!/usr/bin/env node

// Validates bytecode reproducibility for qbitmarket contracts.
//
// Recompiles each contract from its bundled source using the compiler settings
// recorded in the verification manifest and optionally compares the resulting
// runtime bytecode against the on-chain deployed code.
//
// LOCAL MODE (default):
//   Recompiles all contracts and reports the compiled runtime bytecode hash for
//   each one. No RPC access is required. This confirms that the bundled sources
//   plus the recorded compiler settings can reproduce a deterministic build.
//
// ON-CHAIN MODE (--on-chain):
//   Also fetches eth_getCode for each deployed address and compares it against
//   the locally compiled runtime bytecode after CBOR metadata normalization and
//   immutable-reference masking.
//
// Required env:
//   CONTRACTS_DIR    Path to the directory containing bundled .sol files (same
//                    as deploy.js CONTRACTS_DIR).
//
// Optional env:
//   RPC_URL                    JSON-RPC endpoint (required for --on-chain mode).
//   MODULES_DIR                Path to node_modules for --include-path. If
//                              omitted the compiler runs without an include path,
//                              which is correct for fully bundled sources.
//   DEPLOYMENT_STATE_DIR       Override the default state file directory.
//   VERIFICATION_MANIFEST_PATH Override the default manifest path.
//   QBITMARKET_ENV             Environment name for state path resolution.
//   EVM_VERSION                Override EVM version (falls back to manifest).
//
// CLI flags:
//   --on-chain                 Enable on-chain bytecode comparison.
//   --contract <alias>         Limit to a single contract alias from the manifest.
//   --deployment-targets       Limit to aliases produced by manifest.deploymentTargets.
//   --allow-missing-address    Do not fail when a contract has no address yet.
//   --json                     Output the full result object as JSON.
//   -h, --help                 Show usage.
//
// Usage examples:
//   CONTRACTS_DIR=blockchain/contracts/bundled_contracts \
//     node scripts/verify_contract_bytecode.js
//
//   CONTRACTS_DIR=... RPC_URL=https://... \
//     node scripts/verify_contract_bytecode.js --on-chain
//
//   CONTRACTS_DIR=... node scripts/verify_contract_bytecode.js \
//     --contract MarketplacePrimaryImplementation

"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const https = require("https");
const http = require("http");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT_DIR = path.resolve(__dirname, "..");

function getWritableTempRoot() {
  const candidates = [
    process.env.QBITMARKET_BYTECODE_TMP_DIR,
    process.env.TMPDIR,
    "/tmp",
    os.tmpdir(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.W_OK);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return os.tmpdir();
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    onChain: false,
    contract: null,
    deploymentTargets: false,
    allowMissingAddress: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--on-chain") {
      opts.onChain = true;
    } else if (arg === "--contract") {
      opts.contract = argv[i + 1] || null;
      i += 1;
    } else if (arg === "--deployment-targets") {
      opts.deploymentTargets = true;
    } else if (arg === "--allow-missing-address") {
      opts.allowMissingAddress = true;
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: CONTRACTS_DIR=... node scripts/verify_contract_bytecode.js [--on-chain] [--contract alias] [--deployment-targets] [--allow-missing-address] [--json]"
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

const DEPLOYMENT_TARGET_ALIAS_MAP = {
  MarketplacePrimaryUpgradeable: [
    "MarketplacePrimaryImplementation",
    "MarketplacePrimaryProxyAdmin",
    "MarketplacePrimaryProxy",
  ],
};

const SOURCE_DRIFT_HINT_ALIASES = new Set([
  "ERC721CollectionDeployer",
  "ERC1155CollectionDeployer",
  "PaymentTokenFactory",
]);

// ---------------------------------------------------------------------------
// State / manifest path resolution (mirrors deployment/app/statePaths.js)
// ---------------------------------------------------------------------------

function resolveVerificationManifestPath(contractsDir) {
  const configured = process.env.VERIFICATION_MANIFEST_PATH;
  if (configured) return path.resolve(configured);

  const stateDir = process.env.DEPLOYMENT_STATE_DIR;
  if (stateDir) return path.join(path.resolve(stateDir), "verification-manifest.json");

  return path.join(contractsDir, "verification-manifest.json");
}

function loadVerificationManifest(contractsDir) {
  const manifestPath = resolveVerificationManifestPath(contractsDir);
  if (!fs.existsSync(manifestPath)) {
    return { _path: manifestPath, _missing: true };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return { ...parsed, _path: manifestPath };
  } catch (err) {
    throw new Error(`Failed to parse verification manifest at ${manifestPath}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Compiler settings
// ---------------------------------------------------------------------------

function getCompilerSettings(primaryContractName, compiler) {
  const evmVersion = process.env.EVM_VERSION || compiler.evmVersion || "paris";
  const sizeOptimized = (compiler.sizeOptimizedTargets || []).includes(primaryContractName);
  const optimizeRuns = sizeOptimized
    ? String(compiler.solcOptimizeRunsSizeOptimized || "1")
    : String(compiler.solcOptimizeRunsDefault || "200");
  const viaIr = (compiler.viaIrTargets || []).includes(primaryContractName);
  return { evmVersion, optimizeRuns, viaIr };
}

// ---------------------------------------------------------------------------
// Compile a bundled source file
// Returns: { [contractName]: { binRuntime, immutableRefs } }
// ---------------------------------------------------------------------------

function compileBundledSource(sourcePath, settings) {
  const { evmVersion, optimizeRuns, viaIr } = settings;
  const sourceBasename = path.basename(sourcePath);
  const input = {
    language: "Solidity",
    sources: {
      [sourceBasename]: {
        content: fs.readFileSync(sourcePath, "utf8"),
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: Number.parseInt(optimizeRuns, 10),
      },
      evmVersion,
      viaIR: Boolean(viaIr),
      outputSelection: {
        "*": {
          "*": [
            "abi",
            "evm.deployedBytecode.object",
            "evm.deployedBytecode.immutableReferences",
          ],
        },
      },
    },
  };

  let output;
  const tempDir = fs.mkdtempSync(path.join(getWritableTempRoot(), "qbitmarket-solc-input-"));
  const tempInputPath = path.join(tempDir, "standard-json-input.json");
  try {
    fs.writeFileSync(tempInputPath, JSON.stringify(input), "utf8");
    output = execFileSync("solc", ["--standard-json", tempInputPath], {
      encoding: "utf8",
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : "";
    throw new Error(
      `solc compilation failed for ${path.basename(sourcePath)}:\n${stderr || err.message}`
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const json = JSON.parse(output);
  const errors = Array.isArray(json.errors) ? json.errors : [];
  const fatalErrors = errors.filter((entry) => entry.severity === "error");
  if (fatalErrors.length > 0) {
    throw new Error(
      `solc compilation failed for ${path.basename(sourcePath)}:\n` +
        fatalErrors.map((entry) => entry.formattedMessage || entry.message).join("\n")
    );
  }

  const result = {};

  for (const [sourceName, contractsByName] of Object.entries(json.contracts || {})) {
    for (const [contractName, value] of Object.entries(contractsByName || {})) {
      const deployedBytecode = value.evm?.deployedBytecode || {};
      result[contractName] = {
        sourceName,
        binRuntime: deployedBytecode.object || "",
        immutableRefs: deployedBytecode.immutableReferences || {},
      };
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// CBOR metadata normalization
//
// Solidity appends a CBOR block to deployed bytecode. The last 2 bytes encode
// the block length (big-endian). Strip those bytes before comparison so that
// differences in metadata hashes (e.g. from different file paths or timestamps)
// do not cause false failures.
// ---------------------------------------------------------------------------

function stripCborMetadata(hexWithout0x) {
  if (hexWithout0x.length < 4) return hexWithout0x;
  const lastTwoBytes = parseInt(hexWithout0x.slice(-4), 16);
  const stripHexChars = (lastTwoBytes + 2) * 2;
  // Sanity: CBOR block should not exceed 200 bytes, must not strip >50% of code
  if (lastTwoBytes > 200 || stripHexChars >= hexWithout0x.length * 0.5) {
    return hexWithout0x;
  }
  return hexWithout0x.slice(0, hexWithout0x.length - stripHexChars);
}

// ---------------------------------------------------------------------------
// Immutable-reference masking
//
// Contracts with `immutable` state variables embed those values in the runtime
// bytecode at known byte offsets (reported by solc as immutable-references).
// Zero out those ranges before comparison so the check covers the logic code
// rather than deployment-specific values (e.g. the admin address in
// TransparentUpgradeableProxy).
// ---------------------------------------------------------------------------

function applyImmutableMask(hexWithout0x, immutableRefs) {
  if (!immutableRefs || Object.keys(immutableRefs).length === 0) return hexWithout0x;

  const buf = Buffer.from(hexWithout0x, "hex");
  for (const refs of Object.values(immutableRefs)) {
    for (const ref of Array.isArray(refs) ? refs : []) {
      const { start, length } = ref;
      if (typeof start === "number" && typeof length === "number") {
        buf.fill(0, start, start + length);
      }
    }
  }
  return buf.toString("hex");
}

function normalizeForComparison(hexRaw, immutableRefs) {
  const hex = hexRaw.startsWith("0x") ? hexRaw.slice(2) : hexRaw;
  return applyImmutableMask(stripCborMetadata(hex), immutableRefs);
}

function sha256Hex(hex) {
  return crypto.createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
}

function aliasesForDeploymentTargets(manifest, contracts) {
  const targets = Array.isArray(manifest.deploymentTargets)
    ? manifest.deploymentTargets
    : [];
  const aliases = [];

  for (const target of targets) {
    const mappedAliases = DEPLOYMENT_TARGET_ALIAS_MAP[target] || [target];
    for (const alias of mappedAliases) {
      if (contracts[alias] && !aliases.includes(alias)) {
        aliases.push(alias);
      }
    }
  }

  return aliases;
}

// ---------------------------------------------------------------------------
// JSON-RPC: eth_getCode
// ---------------------------------------------------------------------------

function jsonRpcRequest(rpcUrl, method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    let urlObj;
    try {
      urlObj = new URL(rpcUrl);
    } catch (err) {
      reject(new Error(`Invalid RPC_URL: ${rpcUrl}`));
      return;
    }

    const isHttps = urlObj.protocol === "https:";
    const transport = isHttps ? https : http;
    const port = urlObj.port ? parseInt(urlObj.port, 10) : isHttps ? 443 : 80;
    const options = {
      hostname: urlObj.hostname,
      port,
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = transport.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`JSON-RPC error: ${parsed.error.message}`));
          } else {
            resolve(parsed.result);
          }
        } catch (parseErr) {
          reject(new Error(`Failed to parse JSON-RPC response: ${parseErr.message}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error("JSON-RPC request timed out"));
    });
    req.write(body);
    req.end();
  });
}

async function getOnChainBytecode(rpcUrl, address) {
  const code = await jsonRpcRequest(rpcUrl, "eth_getCode", [address, "latest"]);
  if (!code || code === "0x") return null;
  return code;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const contractsDir = process.env.CONTRACTS_DIR;
  if (!contractsDir) {
    throw new Error("Missing environment variable: CONTRACTS_DIR");
  }

  const resolvedContractsDir = path.resolve(contractsDir);
  const manifest = loadVerificationManifest(resolvedContractsDir);

  if (manifest._missing) {
    throw new Error(
      `Verification manifest not found: ${manifest._path}\n` +
        "Run the deployment pipeline first to generate a manifest."
    );
  }

  const manifestPath = manifest._path;
  const compiler = manifest.compiler || {};
  const contracts = manifest.contracts || {};

  if (Object.keys(contracts).length === 0) {
    throw new Error(`No contract entries found in manifest: ${manifestPath}`);
  }

  const rpcUrl = process.env.RPC_URL || "";
  if (opts.onChain && !rpcUrl) {
    throw new Error("RPC_URL is required for --on-chain mode");
  }

  const aliases = opts.contract
    ? [opts.contract]
    : opts.deploymentTargets
      ? aliasesForDeploymentTargets(manifest, contracts)
      : Object.keys(contracts);

  const invalidAlias = opts.contract && !contracts[opts.contract];
  if (invalidAlias) {
    throw new Error(
      `Contract alias not found in manifest: ${opts.contract}\n` +
        `Available aliases: ${Object.keys(contracts).join(", ")}`
    );
  }

  if (opts.deploymentTargets && aliases.length === 0) {
    throw new Error(
      "No manifest contract aliases match deploymentTargets. " +
        "Run without --deployment-targets to verify all manifest entries."
    );
  }

  if (!opts.json) {
    console.log(`Verification manifest: ${manifestPath}`);
    if (manifest.environment) console.log(`Environment: ${manifest.environment}`);
    if (manifest.network?.chainId !== undefined) {
      console.log(`Network chainId: ${manifest.network.chainId}`);
    }
    console.log(`Mode: ${opts.onChain ? "on-chain" : "local"}`);
    if (opts.deploymentTargets) {
      console.log(`Scope: deploymentTargets (${aliases.join(", ")})`);
    }
    console.log("");
  }

  const results = {};
  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const alias of aliases) {
    const entry = contracts[alias];
    const result = {
      alias,
      address: entry.address || null,
      upgradeabilityRole: entry.upgradeabilityRole || null,
      verificationContract: entry.verificationContract || null,
      localCompile: null,
      onChain: null,
      status: "unknown",
      error: null,
    };

    try {
      const verificationContract = entry.verificationContract;
      if (!verificationContract) {
        result.status = "skip";
        result.error = "No verificationContract field in manifest entry";
        skipCount += 1;
        results[alias] = result;
        continue;
      }

      // Parse source file and contract name from "path/to/Source.sol:ContractName"
      const colonIndex = verificationContract.lastIndexOf(":");
      const sourceRef = colonIndex !== -1 ? verificationContract.slice(0, colonIndex) : verificationContract;
      const contractClassName = colonIndex !== -1 ? verificationContract.slice(colonIndex + 1) : verificationContract;
      const sourceBasename = path.basename(sourceRef);
      const primaryContractName = sourceBasename.replace(/\.sol$/i, "");
      const sourcePath = path.join(resolvedContractsDir, sourceBasename);

      if (!fs.existsSync(sourcePath)) {
        result.status = "skip";
        result.error = `Bundled source not found: ${sourcePath}`;
        skipCount += 1;
        results[alias] = result;
        continue;
      }

      // Compile
      const settings = getCompilerSettings(primaryContractName, compiler);
      result.localCompile = { settings, sourcePath, contractClassName };

      let compiled;
      try {
        compiled = compileBundledSource(sourcePath, settings);
      } catch (compileErr) {
        result.status = "fail";
        result.error = compileErr.message;
        failCount += 1;
        results[alias] = result;
        continue;
      }

      const contractOutput = compiled[contractClassName];
      if (!contractOutput) {
        result.status = "fail";
        result.error =
          `Contract class "${contractClassName}" not found in compiled output from ${sourceBasename}. ` +
          `Available: ${Object.keys(compiled).join(", ")}`;
        failCount += 1;
        results[alias] = result;
        continue;
      }

      const { binRuntime, immutableRefs } = contractOutput;
      const hasImmutables = Object.keys(immutableRefs).length > 0;

      result.localCompile.binRuntimeHash = sha256Hex(binRuntime);
      result.localCompile.immutableCount = Object.values(immutableRefs).reduce(
        (sum, refs) => sum + (Array.isArray(refs) ? refs.length : 0),
        0
      );

      if (!opts.onChain) {
        result.status = "local_ok";
        passCount += 1;
        results[alias] = result;
        continue;
      }

      // On-chain comparison
      if (!entry.address) {
        if (opts.allowMissingAddress) {
          result.status = "skip";
          result.error = "No deployed address in manifest (--allow-missing-address)";
          skipCount += 1;
        } else {
          result.status = "fail";
          result.error = "No deployed address in manifest. Deploy first or use --allow-missing-address.";
          failCount += 1;
        }
        results[alias] = result;
        continue;
      }

      const onChainHex = await getOnChainBytecode(rpcUrl, entry.address);
      if (!onChainHex) {
        result.status = "fail";
        result.error = `eth_getCode returned empty bytecode for ${entry.address}. Contract may not be deployed on this network.`;
        result.onChain = { address: entry.address, isEmpty: true };
        failCount += 1;
        results[alias] = result;
        continue;
      }

      const normalizedLocal = normalizeForComparison(binRuntime, immutableRefs);
      const normalizedOnChain = normalizeForComparison(onChainHex, immutableRefs);
      const match = normalizedLocal === normalizedOnChain;

      result.onChain = {
        address: entry.address,
        rawHash: sha256Hex(onChainHex.startsWith("0x") ? onChainHex.slice(2) : onChainHex),
        normalizedHash: sha256Hex(normalizedOnChain),
        hasImmutables,
      };
      result.localCompile.normalizedHash = sha256Hex(normalizedLocal);
      result.status = match ? "pass" : "fail";

      if (match) {
        passCount += 1;
      } else {
        result.error = "Normalized runtime bytecodes do not match.";
        failCount += 1;
      }
    } catch (err) {
      result.status = "error";
      result.error = err.message;
      failCount += 1;
    }

    results[alias] = result;
  }

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          manifestPath,
          mode: opts.onChain ? "on-chain" : "local",
          summary: { pass: passCount, fail: failCount, skip: skipCount },
          contracts: results,
        },
        null,
        2
      )
    );
  } else {
    for (const [alias, result] of Object.entries(results)) {
      const statusLabel = {
        pass: "PASS",
        fail: "FAIL",
        skip: "SKIP",
        local_ok: "OK  ",
        error: "ERR ",
        unknown: "?   ",
      }[result.status] || result.status.toUpperCase();

      let line = `[${statusLabel}] ${alias}`;
      if (result.address) line += `  ${result.address}`;
      if (result.upgradeabilityRole) line += `  (${result.upgradeabilityRole})`;
      console.log(line);

      if (result.localCompile) {
        const { settings, contractClassName, binRuntimeHash, normalizedHash, immutableCount } = result.localCompile;
        console.log(
          `       source: ${contractClassName}  runs=${settings.optimizeRuns}  ` +
            `via-ir=${settings.viaIr}  evm=${settings.evmVersion}`
        );
        if (binRuntimeHash) {
          console.log(`       compiled bin-runtime sha256: ${binRuntimeHash}`);
        }
        if (normalizedHash) {
          console.log(
            `       normalized sha256: ${normalizedHash}` +
              (immutableCount > 0 ? `  (${immutableCount} immutable ref(s) masked)` : "")
          );
        }
      }

      if (result.onChain) {
        const { address, rawHash, normalizedHash: ocNorm } = result.onChain;
        if (rawHash) console.log(`       on-chain raw sha256: ${rawHash}`);
        if (ocNorm) console.log(`       on-chain normalized sha256: ${ocNorm}`);
      }

      if (result.error) {
        console.log(`       error: ${result.error}`);
        if (
          result.error === "Normalized runtime bytecodes do not match." &&
          SOURCE_DRIFT_HINT_ALIASES.has(alias)
        ) {
          console.log(
            "       hint: this factory/deployer embeds child contract creation bytecode; " +
              "a mismatch usually means the on-chain factory was deployed from older child source."
          );
        }
      }

      console.log("");
    }

    const total = passCount + failCount + skipCount;
    if (opts.onChain) {
      console.log(`Results: ${passCount}/${total} passed, ${failCount} failed, ${skipCount} skipped`);
    } else {
      console.log(`Local compilation: ${passCount} ok, ${failCount} failed, ${skipCount} skipped`);
      console.log("Rerun with --on-chain to compare against deployed bytecode.");
    }
  }

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
