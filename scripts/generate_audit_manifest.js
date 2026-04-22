#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
let outputPath = path.join("/tmp", "qbitmarket-contract-audit-evidence", "audit-evidence-manifest.json");
let summaryPath = path.join("/tmp", "qbitmarket-contract-audit-evidence", "audit-evidence-summary.md");

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--output") {
    outputPath = path.resolve(args[index + 1]);
    index += 1;
  } else if (arg === "--summary-output") {
    summaryPath = path.resolve(args[index + 1]);
    index += 1;
  } else if (arg === "--help" || arg === "-h") {
    console.log("Usage: scripts/generate_audit_manifest.js [--output path] [--summary-output path]");
    process.exit(0);
  } else {
    throw new Error(`Unknown argument: ${arg}`);
  }
}

function command(args_, options = {}) {
  try {
    return execFileSync(args_[0], args_.slice(1), {
      cwd: options.cwd || rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function relative(filePath) {
  const relativePath = path.relative(rootDir, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return path.resolve(filePath).split(path.sep).join("/");
  }

  return relativePath.split(path.sep).join("/");
}

function listFiles(dirPath, predicate) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const results = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(entryPath, predicate));
    } else if (!predicate || predicate(entryPath)) {
      results.push(entryPath);
    }
  }

  return results.sort();
}

function fileRecord(filePath) {
  return {
    path: relative(filePath),
    sha256: sha256File(filePath),
    bytes: fs.statSync(filePath).size,
  };
}

function existing(paths) {
  return paths.map((item) => path.resolve(rootDir, item)).filter((item) => fs.existsSync(item));
}

function summarizeSlither(filePath) {
  const report = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const detectors = report.results && Array.isArray(report.results.detectors) ? report.results.detectors : [];
  const byImpact = {};
  const byCheck = {};

  for (const detector of detectors) {
    const impact = detector.impact || "unknown";
    const check = detector.check || "unknown";
    byImpact[impact] = (byImpact[impact] || 0) + 1;
    byCheck[check] = (byCheck[check] || 0) + 1;
  }

  return {
    path: fileRecord(filePath),
    success: report.success,
    detectorCount: detectors.length,
    byImpact,
    byCheck,
  };
}

function summarizeMythril(filePath) {
  const report = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const issues = Array.isArray(report.issues) ? report.issues : [];
  const bySeverity = {};

  for (const issue of issues) {
    const severity = issue.severity || "unknown";
    bySeverity[severity] = (bySeverity[severity] || 0) + 1;
  }

  return {
    path: fileRecord(filePath),
    success: report.success,
    issueCount: issues.length,
    bySeverity,
  };
}

function reportSummaries(dirPath, summarizer) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return listFiles(dirPath, (filePath) => filePath.endsWith(".json")).map((filePath) => {
    try {
      return summarizer(filePath);
    } catch (error) {
      return {
        path: fileRecord(filePath),
        error: error.message,
      };
    }
  });
}

const slitherOutputDir = path.resolve(process.env.SLITHER_OUTPUT_DIR || "/tmp/qbitmarket-contract-slither");
const mythrilOutputDir = path.resolve(process.env.MYTHRIL_OUTPUT_DIR || "/tmp/qbitmarket-contract-mythril");
const auditEvidenceDir = path.resolve(
  process.env.AUDIT_EVIDENCE_DIR || path.dirname(slitherOutputDir)
);

const sourceFiles = [
  ...listFiles(path.join(rootDir, "blockchain", "contracts"), (filePath) => {
    const normalized = relative(filePath);
    return (
      normalized.endsWith(".sol") &&
      !normalized.includes("/bundled_contracts/") &&
      !normalized.includes("/abis/")
    );
  }),
  ...existing([
    "scripts/run_slither.sh",
    "scripts/run_mythril.sh",
    "scripts/check_slither_triage.js",
    "scripts/generate_audit_manifest.js",
    "docs/audit-triage.md",
    "docs/slither-accepted-findings.json",
    "docs/operational-authority.md",
    "docs/publication-model.md",
  ]),
];

const bundledFiles = listFiles(path.join(rootDir, "blockchain", "contracts", "bundled_contracts"), (filePath) =>
  filePath.endsWith(".sol")
);

const abiFiles = listFiles(path.join(rootDir, "blockchain", "contracts", "abis"), (filePath) =>
  filePath.endsWith(".json") || filePath.endsWith(".ts")
);

const hardhatArtifacts = existing([
  "blockchain/artifacts/contracts/MarketplaceSecondaryERC721.sol/MarketplaceSecondaryERC721.json",
  "blockchain/artifacts/contracts/MarketplaceSecondaryERC1155.sol/MarketplaceSecondaryERC1155.json",
]);

const verificationManifests = listFiles(path.join(rootDir, "deployment", "state"), (filePath) =>
  path.basename(filePath) === "verification-manifest.json"
);
const slitherTriageGatePath = path.join(
  auditEvidenceDir,
  "slither-triage-gate.json"
);

const dockerImage = process.env.MYTHRIL_DOCKER_IMAGE || "mythril/myth";
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repository: process.env.GITHUB_REPOSITORY || command(["git", "config", "--get", "remote.origin.url"]),
  commit: process.env.GITHUB_SHA || command(["git", "rev-parse", "HEAD"]),
  ref: process.env.GITHUB_REF || command(["git", "rev-parse", "--abbrev-ref", "HEAD"]),
  githubRun: {
    runId: process.env.GITHUB_RUN_ID || null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    workflow: process.env.GITHUB_WORKFLOW || null,
  },
  toolVersions: {
    node: process.version,
    npm: command(["npm", "--version"]),
    hardhat: command(["npx", "hardhat", "--version"], { cwd: path.join(rootDir, "blockchain") }),
    slither: command(["slither", "--version"]),
    docker: command(["docker", "--version"]),
    mythrilImage: dockerImage,
    mythril: command(["docker", "run", "--rm", dockerImage, "version"]),
  },
  analysisProfile: {
    slitherOutputDir,
    mythrilOutputDir,
    mythrilExecutionTimeout: process.env.MYTHRIL_EXECUTION_TIMEOUT || "60",
    mythrilMaxDepth: process.env.MYTHRIL_MAX_DEPTH || "32",
    mythrilTransactionCount: process.env.MYTHRIL_TRANSACTION_COUNT || "2",
  },
  files: {
    sources: sourceFiles.map(fileRecord),
    bundledSources: bundledFiles.map(fileRecord),
    abis: abiFiles.map(fileRecord),
    hardhatArtifacts: hardhatArtifacts.map(fileRecord),
    verificationManifests: verificationManifests.map(fileRecord),
  },
  reports: {
    slither: reportSummaries(slitherOutputDir, summarizeSlither),
    mythril: reportSummaries(mythrilOutputDir, summarizeMythril),
    slitherTriageGate: fs.existsSync(slitherTriageGatePath) ? fileRecord(slitherTriageGatePath) : null,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

const slitherDetectorCount = manifest.reports.slither.reduce((sum, item) => sum + (item.detectorCount || 0), 0);
const mythrilIssueCount = manifest.reports.mythril.reduce((sum, item) => sum + (item.issueCount || 0), 0);
const slitherTriageGate = manifest.reports.slitherTriageGate ? "present" : "missing";

const summary = [
  "# Contracts V3 Audit Evidence",
  "",
  `- Generated at: ${manifest.generatedAt}`,
  `- Commit: ${manifest.commit || "unknown"}`,
  `- Ref: ${manifest.ref || "unknown"}`,
  `- Slither reports: ${manifest.reports.slither.length}`,
  `- Slither detector results: ${slitherDetectorCount}`,
  `- Slither triage gate: ${slitherTriageGate}`,
  `- Mythril reports: ${manifest.reports.mythril.length}`,
  `- Mythril issues: ${mythrilIssueCount}`,
  `- Source files hashed: ${manifest.files.sources.length}`,
  `- Bundled source files hashed: ${manifest.files.bundledSources.length}`,
  `- ABI files hashed: ${manifest.files.abis.length}`,
  `- Hardhat artifacts hashed: ${manifest.files.hardhatArtifacts.length}`,
  "",
  "Automated analysis is evidence of process, not a guarantee of absence of vulnerabilities.",
  "Accepted or informational findings must be explained in the triage document.",
  "",
].join("\n");

fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
fs.writeFileSync(summaryPath, summary);

console.log(`Wrote ${outputPath}`);
console.log(`Wrote ${summaryPath}`);
