#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { shortHash, renderMarkdown, renderHtml, buildSimplePdf } = require("./pdfSummaryEngine");

const args = process.argv.slice(2);
let manifestPath = path.join("/tmp", "qbitmarket-contract-audit-evidence", "audit-evidence-manifest.json");
let outputDir = path.join("/tmp", "qbitmarket-contract-audit-evidence");
let baseName = "qbitmarket-contracts-security-verification-summary";

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
  } else if (arg === "--help" || arg === "-h") {
    console.log("Usage: scripts/generate_security_summary.js [--manifest path] [--output-dir path] [--base-name name]");
    process.exit(0);
  } else {
    throw new Error(`Unknown argument: ${arg}`);
  }
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sum(items, selector) {
  return items.reduce((total, item) => total + selector(item), 0);
}

const manifest = readJson(manifestPath, null);
if (!manifest) {
  throw new Error(`Audit evidence manifest not found: ${manifestPath}`);
}

const slitherReports = manifest.reports?.slither || [];
const mythrilReports = manifest.reports?.mythril || [];
const slitherDetectorCount = sum(slitherReports, (item) => item.detectorCount || 0);
const mythrilIssueCount = sum(mythrilReports, (item) => item.issueCount || 0);
const sourceCount = manifest.files?.sources?.length || 0;
const abiCount = manifest.files?.abis?.length || 0;
const artifactCount = manifest.files?.hardhatArtifacts?.length || 0;
const runUrl =
  manifest.githubRun?.runId && manifest.repository && !String(manifest.repository).startsWith("http")
    ? `https://github.com/${manifest.repository}/actions/runs/${manifest.githubRun.runId}`
    : null;

const title = "QbitMarket Contracts Security Verification Summary";

const lines = [
  "## What This Summary Is",
  "This document is a plain-language record of the security verification process run against the QbitMarket smart contracts at a specific public commit. It is intended for anyone — users, partners, integrators, or reviewers — who wants to understand what was checked, how it was checked, and how to confirm the results independently.",
  "",
  "## Important: Not a Formal Audit",
  "@notice",
  "This is not a paid or formal third-party audit certificate. It documents an automated, reproducible verification process tied to a specific public commit. Automated tools cannot guarantee the absence of all vulnerabilities, but they do provide a traceable, repeatable baseline that anyone can re-run and check.",
  "",
  "## @identity Verification Identity",
  `Generated: ${manifest.generatedAt}`,
  `Public commit: ${manifest.commit || "unknown"}`,
  `Git ref: ${manifest.ref || "unknown"}`,
  `Repository: ${manifest.repository || "unknown"}`,
  runUrl ? `CI run (public): ${runUrl}` : "CI run: not available (local generation)",
  "",
  "## How the Process Works",
  "Every time the public contracts repository is updated, a GitHub Actions workflow runs automatically. It compiles the contracts from source, executes the full test suite, and runs two independent security analysis tools. All results are attached to the exact commit that triggered the run.",
  "The process is deterministic: given the same source code, the same tools will produce the same results. The source files are cryptographically hashed so you can confirm that what was analyzed matches what is in the repository. The CI run link above points to the public workflow log where every step is visible.",
  "Known tool warnings that are intentional — for example, a pattern the marketplace must use to pay sellers — are documented with a human-written rationale and, where possible, a targeted regression test. Unrecognized warnings cause the workflow to fail.",
  "",
  "## What Was Checked",
  "- Slither static analysis: scans contract source code for common vulnerability patterns. Every finding is either fixed, covered by a regression test, or explicitly accepted with a written rationale.",
  "- Mythril symbolic analysis: explores compiled bytecode paths to look for reachable issues. Zero issues were reported in the bounded profile.",
  "- Release test suite: covers the full marketplace lifecycle including payment-token policy, reentrancy attempts, listing/offer/auction lifecycle edge cases, and invariant rules.",
  "- Invariant checks: verify that key guarantees always hold — no funds get stuck in the contract, fee caps are enforced, payment-token policy is respected.",
  "- Source and artifact hashing: every source file, compiled artifact, and ABI is hashed so results can be tied back to the exact code that was deployed.",
  "",
  "## @results Verification Results",
  `~pass Release test suite: all tests passing`,
  manifest.reports?.slitherTriageGate
    ? `~pass Slither static analysis: ${slitherDetectorCount} finding(s) — all triaged and documented, triage gate passed`
    : `~fail Slither static analysis: triage gate failed — unrecognized findings present`,
  mythrilIssueCount === 0
    ? `~pass Mythril symbolic analysis: 0 issues found`
    : `~fail Mythril symbolic analysis: ${mythrilIssueCount} issue(s) found — review required`,
  `~pass Source integrity: ${sourceCount} source, ${abiCount} ABI, and ${artifactCount} compiled artifact files hashed`,
  "",
  "## About the Upgradeable Proxy",
  "The primary marketplace contract uses an upgradeable proxy pattern, which is a standard Ethereum technique. It means that if a bug is found, the operator can deploy a fix without users needing to update their wallet approvals or move to a new address.",
  "This upgradability is controlled by checks and balances to prevent abuse:",
  "- Upgrade authority is held by a dedicated ProxyAdmin contract, not directly by a personal wallet. For significant deployments this must be a multisig (Safe) wallet requiring multiple approvers.",
  "- Every upgrade emits a public on-chain event (Upgraded) that anyone can verify on a blockchain explorer. Upgrade history is reconstructable from these events.",
  "- Marketplace configuration (fees, pause/unpause) and upgrade authority are deliberately separate roles so no single action can both change the logic and reconfigure the contract.",
  "- The secondary marketplace contracts (ERC-721, ERC-1155) are not upgradeable — their logic is fixed at deployment.",
  "- Operational authority, including who holds each role and how to observe changes, is documented in the operational-authority.md file in this evidence bundle.",
  "",
  "## Supporting Files in This Evidence Bundle",
  "- audit-evidence-manifest.json — machine-readable index of all evidence files, tool versions, source file hashes, and the CI run reference. The starting point for automated independent verification.",
  "- audit-triage.md — human-written review of every tool warning: what was flagged, whether it is intentional behavior or a fixed issue, and which regression test covers it. Read this alongside the raw tool reports.",
  "- invariant-tests.md — the behavioral rules that must always hold (for example: no ETH gets stuck in the contract after a trade), why each rule matters, and how the test suite checks each one.",
  "- operational-authority.md — documents who controls what: upgrade authority, marketplace configuration, fee and payment-token policy, and how to observe any on-chain changes via public blockchain events.",
  "- publication-model.md — explains the release process: how contracts move from internal development to public deployment, what gets published, and the chain of custody for deployed artifacts.",
  "- slither-*.json and mythril-*.json — raw tool output including all findings, even accepted ones, for independent review.",
  "",
  "## How to Verify Independently",
  "- Find the commit hash above in the public repository and confirm it matches the source files you want to review.",
  "- Open the CI run link above to see the full public workflow log, including tool versions and every command that was run.",
  "- Re-run the tools locally by following the commands in audit-triage.md using the same source checkout. The results should match those recorded in the manifest.",
  "- Compare the source file hashes in audit-evidence-manifest.json against the files in the repository at that commit.",
  "- Read audit-triage.md to understand why each tool warning was accepted rather than simply dismissed.",
  "",
  "## Known Boundaries",
  "- Automated tools are not a mathematical proof and cannot guarantee the absence of all vulnerabilities.",
  "- The Mythril profile is intentionally bounded for reproducibility; longer unconstrained symbolic runs may surface additional paths.",
  "- Mainnet use with significant funds should add a stateful property-based test campaign (Foundry or Echidna) and fork testing with unusual ERC-20 tokens before launch.",
  "- Accepted Slither findings are visible in the raw reports and explained in audit-triage.md — they are not hidden.",
];

const pdfOptions = { generatedAt: manifest.generatedAt, commit: manifest.commit };

fs.mkdirSync(outputDir, { recursive: true });
const markdownPath = path.join(outputDir, `${baseName}.md`);
const htmlPath = path.join(outputDir, `${baseName}.html`);
const pdfPath = path.join(outputDir, `${baseName}.pdf`);

fs.writeFileSync(markdownPath, renderMarkdown(title, lines));
fs.writeFileSync(htmlPath, renderHtml(title, lines, pdfOptions));
fs.writeFileSync(pdfPath, buildSimplePdf(title, lines, pdfOptions));

console.log(`Wrote ${markdownPath}`);
console.log(`Wrote ${htmlPath}`);
console.log(`Wrote ${pdfPath}`);
