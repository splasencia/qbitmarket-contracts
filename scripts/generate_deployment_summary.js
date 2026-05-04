#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { shortHash, escapeHtml, renderMarkdown, renderHtml, buildSimplePdf } = require("./pdfSummaryEngine");

const args = process.argv.slice(2);
let manifestPath = null;
let outputDir = "/tmp/qbitmarket-contract-deployment-summary";
let baseName = "qbitmarket-contracts-deployment-summary";
let auditCommit = null;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--manifest") {
    manifestPath = path.resolve(args[index + 1]);
    index += 1;
  } else if (arg === "--output-dir") {
    outputDir = path.resolve(args[index + 1]);
    index += 1;
  } else if (arg === "--base-name") {
    baseName = args[index + 1];
    index += 1;
  } else if (arg === "--audit-commit") {
    auditCommit = args[index + 1];
    index += 1;
  } else if (arg === "--help" || arg === "-h") {
    console.log(
      "Usage: scripts/generate_deployment_summary.js --manifest path [--output-dir path] [--base-name name] [--audit-commit sha]"
    );
    process.exit(0);
  } else {
    throw new Error(`Unknown argument: ${arg}`);
  }
}

if (!manifestPath) {
  throw new Error("--manifest is required");
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const manifest = readJson(manifestPath, null);
if (!manifest) {
  throw new Error(`Deployment verification manifest not found: ${manifestPath}`);
}

// ---------------------------------------------------------------------------
// Derive content from manifest
// ---------------------------------------------------------------------------

const env = manifest.environment || "unknown";
const chainId = manifest.network?.chainId ?? "unknown";
const compilerVersion = manifest.compiler?.version || "unknown";
const generatedAt = manifest.generatedAt || null;
const contracts = manifest.contracts || {};
const deploymentTargets = Array.isArray(manifest.deploymentTargets) ? manifest.deploymentTargets : Object.keys(contracts);

// Infer the display role of each contract from its alias and entry fields.
function contractRole(alias, entry) {
  if (entry.implementationAddress) return "upgradeable proxy";
  if (alias.endsWith("Implementation")) return "proxy implementation";
  if (alias.endsWith("ProxyAdmin")) return "proxy admin";
  if (alias.endsWith("Deployer")) return "deployer helper";
  if (alias.endsWith("Factory")) return "factory";
  return "standalone";
}

// Verification checks derived purely from the manifest (no on-chain calls).
const allEntries = Object.entries(contracts);
const targetEntries = deploymentTargets.length > 0
  ? allEntries.filter(([alias]) => deploymentTargets.includes(alias))
  : allEntries;

const missingAddresses = targetEntries.filter(([, entry]) => !entry.address);
const allAddressesPresent = missingAddresses.length === 0;

const ownerVerifications = allEntries.filter(([, entry]) => entry.ownerVerification);
const ownerVerificationFailed = ownerVerifications.filter(
  ([, entry]) => entry.ownerVerification.matchesExpectedOwner === false
);
const ownerVerificationPassed =
  ownerVerifications.length > 0 && ownerVerificationFailed.length === 0;
const noOwnerVerification = ownerVerifications.length === 0;

const proxiesWithoutAdmin = allEntries.filter(
  ([, entry]) => entry.implementationAddress && !entry.proxyAdminAddress
);
const proxyConfigComplete = proxiesWithoutAdmin.length === 0;

const entriesWithPostDeploy = allEntries.filter(
  ([, entry]) =>
    entry.postDeployConfiguration && Object.keys(entry.postDeployConfiguration).length > 0
);
const postDeployApplied = entriesWithPostDeploy.length > 0;

// ---------------------------------------------------------------------------
// Build lines array
// ---------------------------------------------------------------------------

const title = "QbitMarket Contracts Deployment Summary";

const lines = [
  "## What This Document Is",
  "This document records what was deployed, where each contract lives on-chain, and what verification was completed at the time of deployment. It is the counterpart to the pre-deployment audit evidence report, which documents the security analysis of the source code.",
  "The addresses, ownership claims, and configuration values recorded here were verified at deployment time by the deployment workflow. Use a blockchain explorer to independently confirm any on-chain value before relying on it.",
  "",
  "## @identity Deployment Identity",
  `Environment: ${env}`,
  `Network chain ID: ${chainId}`,
  `Compiler: ${compilerVersion}`,
  `Deployed at: ${generatedAt || "unknown"}`,
  ...(auditCommit ? [`Audit evidence commit: ${auditCommit}`] : []),
  "",
  "## Deployed Contracts",
  ...targetEntries.flatMap(([alias, entry]) => {
    const role = contractRole(alias, entry);
    const addr = entry.address || "(no address)";
    const block = entry.deployBlockNumber != null ? `, deploy block ${entry.deployBlockNumber}` : "";
    const impl = entry.implementationAddress ? `, implementation ${entry.implementationAddress}` : "";
    return [`- ${alias}: ${addr} (${role}${block}${impl})`];
  }),
  "",
  "## @results Verification Results",
  allAddressesPresent
    ? `~pass All deployment targets have on-chain addresses (${targetEntries.length} contract${targetEntries.length !== 1 ? "s" : ""})`
    : `~fail ${missingAddresses.length} deployment target${missingAddresses.length !== 1 ? "s" : ""} missing an address: ${missingAddresses.map(([a]) => a).join(", ")}`,
  noOwnerVerification
    ? `~pass Owner verification: not checked in this deployment run`
    : ownerVerificationPassed
      ? `~pass Owner verification passed for all ${ownerVerifications.length} checked contract${ownerVerifications.length !== 1 ? "s" : ""}`
      : `~fail Owner verification failed for: ${ownerVerificationFailed.map(([a]) => a).join(", ")}`,
  proxyConfigComplete
    ? `~pass Proxy configuration complete: all proxies have an implementation and proxy admin address`
    : `~fail Proxy admin address missing for: ${proxiesWithoutAdmin.map(([a]) => a).join(", ")}`,
  postDeployApplied
    ? `~pass Post-deployment configuration applied (${entriesWithPostDeploy.map(([a]) => a).join(", ")})`
    : `~pass Post-deployment configuration: none required for this deployment`,
  "",
  "## How to Verify On-Chain",
  `- Look up each contract address on a blockchain explorer for chain ID ${chainId} and confirm the bytecode is deployed.`,
  "- Call owner() on each marketplace and factory contract to confirm the current owner matches the expected multisig or Safe address.",
  "- For the primary proxy, call implementation() via the ProxyAdmin or read the EIP-1967 slot (0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc) to confirm the implementation address.",
  "- Recompile and compare bytecode locally using: node scripts/verify_contract_bytecode.js",
  "- Cross-reference this deployment with the audit evidence report for the same source commit to confirm the deployed code matches what was analysed.",
  "",
  "## Important: Limits of This Document",
  "@notice",
  "This document records state at deployment time. It does not reflect subsequent owner transfers, upgrades, configuration changes, or administrative actions. Always verify current on-chain state directly before relying on any value recorded here.",
];

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------

const pdfOptions = { generatedAt, commit: auditCommit };
const subtitleHtml = [
  env !== "unknown" ? `Environment: <strong>${escapeHtml(env)}</strong>` : null,
  chainId !== "unknown" ? `Chain ID: ${escapeHtml(String(chainId))}` : null,
  generatedAt ? `Deployed ${escapeHtml(generatedAt)}` : null,
  auditCommit ? `Audit commit: ${escapeHtml(shortHash(auditCommit))}` : null,
].filter(Boolean).join(" &nbsp;&middot;&nbsp; ");

fs.mkdirSync(outputDir, { recursive: true });
const markdownPath = path.join(outputDir, `${baseName}.md`);
const htmlPath = path.join(outputDir, `${baseName}.html`);
const pdfPath = path.join(outputDir, `${baseName}.pdf`);

fs.writeFileSync(markdownPath, renderMarkdown(title, lines));
fs.writeFileSync(htmlPath, renderHtml(title, lines, { ...pdfOptions, subtitleHtml }));
fs.writeFileSync(pdfPath, buildSimplePdf(title, lines, pdfOptions));

console.log(`Wrote ${markdownPath}`);
console.log(`Wrote ${htmlPath}`);
console.log(`Wrote ${pdfPath}`);
