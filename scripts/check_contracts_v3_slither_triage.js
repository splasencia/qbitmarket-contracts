#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
let reportsDir = process.env.SLITHER_OUTPUT_DIR || "/tmp/qbitmarket-contracts-v3-slither";
let allowlistPath = path.join(rootDir, "docs", "contracts-v3-slither-accepted-findings.json");
let outputPath = "";

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--reports-dir") {
    reportsDir = args[index + 1];
    index += 1;
  } else if (arg === "--allowlist") {
    allowlistPath = args[index + 1];
    index += 1;
  } else if (arg === "--output") {
    outputPath = args[index + 1];
    index += 1;
  } else if (arg === "--help" || arg === "-h") {
    console.log("Usage: scripts/check_contracts_v3_slither_triage.js [--reports-dir path] [--allowlist path] [--output path]");
    process.exit(0);
  } else {
    throw new Error(`Unknown argument: ${arg}`);
  }
}

reportsDir = path.resolve(reportsDir);
allowlistPath = path.resolve(allowlistPath);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listReportFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Slither reports directory does not exist: ${dirPath}`);
  }

  return fs
    .readdirSync(dirPath)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(dirPath, name))
    .sort();
}

const allowlist = readJson(allowlistPath);
const acceptedChecks = allowlist.acceptedChecks || {};
const reportFiles = listReportFiles(reportsDir);

if (reportFiles.length === 0) {
  throw new Error(`No Slither JSON reports found in ${reportsDir}`);
}

const summary = {
  schemaVersion: 1,
  reportsDir,
  allowlist: allowlistPath,
  reportCount: reportFiles.length,
  detectorCount: 0,
  checks: {},
  unclassified: [],
};

for (const reportFile of reportFiles) {
  const report = readJson(reportFile);
  const detectors = report.results && Array.isArray(report.results.detectors) ? report.results.detectors : [];

  for (const detector of detectors) {
    const check = detector.check || "unknown";
    const impact = detector.impact || "unknown";
    const accepted = acceptedChecks[check];
    summary.detectorCount += 1;

    if (!summary.checks[check]) {
      summary.checks[check] = {
        count: 0,
        impacts: {},
        status: accepted ? accepted.status : "unclassified",
      };
    }

    summary.checks[check].count += 1;
    summary.checks[check].impacts[impact] = (summary.checks[check].impacts[impact] || 0) + 1;

    if (!accepted || !Array.isArray(accepted.impacts) || !accepted.impacts.includes(impact)) {
      summary.unclassified.push({
        report: reportFile,
        check,
        impact,
        confidence: detector.confidence || "unknown",
        description: detector.description || "",
      });
    }
  }
}

if (outputPath) {
  const resolvedOutput = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, `${JSON.stringify(summary, null, 2)}\n`);
}

console.log(`Slither triage reports: ${summary.reportCount}`);
console.log(`Slither detector results: ${summary.detectorCount}`);
console.log(`Slither detector families: ${Object.keys(summary.checks).sort().join(", ")}`);

if (summary.unclassified.length > 0) {
  console.error(`Unclassified Slither findings: ${summary.unclassified.length}`);
  for (const item of summary.unclassified) {
    console.error(`- ${item.check} (${item.impact}/${item.confidence}) in ${item.report}`);
  }
  process.exit(1);
}

console.log("All Slither findings are classified by docs/contracts-v3-slither-accepted-findings.json");
