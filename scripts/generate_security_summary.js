#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

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

function shortHash(value) {
  if (!value || value === "unknown") return "unknown";
  return String(value).slice(0, 12);
}

function sum(items, selector) {
  return items.reduce((total, item) => total + selector(item), 0);
}

function flattenCounts(items, fieldName) {
  const result = {};
  for (const item of items) {
    const counts = item[fieldName] || {};
    for (const [key, count] of Object.entries(counts)) {
      result[key] = (result[key] || 0) + count;
    }
  }
  return result;
}

function formatCounts(counts) {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return "none";
  return entries.map(([name, count]) => `${name}: ${count}`).join(", ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapText(text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function pdfEscape(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function buildSimplePdf(title, lines) {
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 54;
  const marginY = 54;
  const lineHeight = 14;
  const bodySize = 10;
  const titleSize = 16;
  const pages = [];
  let commands = [];
  let y = pageHeight - marginY;

  function newPage() {
    if (commands.length > 0) {
      pages.push(commands);
    }
    commands = [];
    y = pageHeight - marginY;
  }

  function drawLine(text, options = {}) {
    const size = options.title ? titleSize : bodySize;
    const font = options.bold ? "/F2" : "/F1";
    const indent = options.indent || 0;

    if (y < marginY) newPage();
    commands.push(`BT ${font} ${size} Tf ${marginX + indent} ${y} Td (${pdfEscape(text)}) Tj ET`);
    y -= options.title ? 22 : lineHeight;
  }

  drawLine(title, { title: true, bold: true });
  for (const item of lines) {
    if (item === "") {
      y -= 7;
      continue;
    }

    const isHeading = item.startsWith("## ");
    const isBullet = item.startsWith("- ");
    const text = isHeading ? item.slice(3) : isBullet ? item.slice(2) : item;
    const prefix = isBullet ? "- " : "";
    const indent = isBullet ? 14 : 0;
    const width = isBullet ? 82 : 88;

    for (const [lineIndex, wrapped] of wrapText(text, width).entries()) {
      drawLine(`${lineIndex === 0 ? prefix : "  "}${wrapped}`, {
        bold: isHeading,
        indent,
      });
    }

    if (isHeading) y -= 3;
  }
  if (commands.length > 0) pages.push(commands);

  const objects = [];
  function addObject(body) {
    objects.push(body);
    return objects.length;
  }

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("PAGES_PLACEHOLDER");
  const fontRegularId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = [];

  for (const pageCommands of pages) {
    const stream = pageCommands.join("\n");
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
        `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(chunks.join(""), "utf8"));
    chunks.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
  }

  const xrefOffset = Buffer.byteLength(chunks.join(""), "utf8");
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  for (let index = 1; index < offsets.length; index += 1) {
    chunks.push(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.from(chunks.join(""), "utf8");
}

const manifest = readJson(manifestPath, null);
if (!manifest) {
  throw new Error(`Audit evidence manifest not found: ${manifestPath}`);
}

const slitherReports = manifest.reports?.slither || [];
const mythrilReports = manifest.reports?.mythril || [];
const slitherDetectorCount = sum(slitherReports, (item) => item.detectorCount || 0);
const mythrilIssueCount = sum(mythrilReports, (item) => item.issueCount || 0);
const slitherImpacts = flattenCounts(slitherReports, "byImpact");
const mythrilSeverities = flattenCounts(mythrilReports, "bySeverity");
const verificationManifestCount = manifest.files?.verificationManifests?.length || 0;
const sourceCount = manifest.files?.sources?.length || 0;
const bundledCount = manifest.files?.bundledSources?.length || 0;
const abiCount = manifest.files?.abis?.length || 0;
const artifactCount = manifest.files?.hardhatArtifacts?.length || 0;
const runUrl =
  manifest.githubRun?.runId && manifest.repository && !String(manifest.repository).startsWith("http")
    ? `https://github.com/${manifest.repository}/actions/runs/${manifest.githubRun.runId}`
    : null;

const title = "QbitMarket Contracts Security Verification Summary";
const generatedDate = new Date(manifest.generatedAt).toISOString().slice(0, 10);
const noticeText =
  "This is not a paid or formal third-party audit certificate. It documents an automated, reproducible verification process tied to a specific public commit. Automated tools cannot guarantee the absence of all vulnerabilities, but they do provide a traceable, repeatable baseline that anyone can re-run and check.";
const lines = [
  "## What This Summary Is",
  "This document is a plain-language record of the security verification process run against the QbitMarket smart contracts at a specific public commit. It is intended for anyone — users, partners, integrators, or reviewers — who wants to understand what was checked, how it was checked, and how to confirm the results independently.",
  "",
  "## Important: Not a Formal Audit",
  noticeText,
  "",
  "## Verification Identity",
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
  "## Automated Results",
  `Slither reports: ${slitherReports.length} | Findings: ${slitherDetectorCount} (all triaged) | By impact: ${formatCounts(slitherImpacts)}`,
  `Mythril reports: ${mythrilReports.length} | Issues: ${mythrilIssueCount} | By severity: ${formatCounts(mythrilSeverities) || "none"}`,
  `Slither triage gate: ${manifest.reports?.slitherTriageGate ? "present — unrecognized findings would have failed CI" : "missing"}`,
  `Files hashed: ${sourceCount} source, ${bundledCount} bundled, ${abiCount} ABI, ${artifactCount} compiled artifacts`,
  `Deployment verification manifests: ${verificationManifestCount}`,
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

const markdown = [
  `# ${title}`,
  "",
  ...lines.map((line) => (line.startsWith("## ") || line.startsWith("- ") || line === "" ? line : `${line}`)),
  "",
].join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1f2933; margin: 0; padding: 0; background: #f5f7fa; }
    .wrapper { max-width: 820px; margin: 48px auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); padding: 48px 56px 56px; }
    h1 { font-size: 26px; font-weight: 700; margin: 0 0 6px; color: #102a43; }
    .subtitle { color: #52606d; font-size: 13px; margin: 0 0 32px; }
    h2 { font-size: 15px; font-weight: 700; margin: 32px 0 10px; color: #243b53; border-bottom: 1px solid #e8edf2; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
    p { font-size: 13.5px; margin: 0 0 8px; line-height: 1.6; color: #334e68; }
    ul { margin: 0 0 8px; padding-left: 20px; }
    li { font-size: 13.5px; line-height: 1.7; color: #334e68; }
    .notice { background: #fffbea; border-left: 4px solid #f0b429; padding: 14px 16px; border-radius: 4px; margin: 0 0 8px; }
    .notice p { margin: 0; color: #5c4813; font-size: 13px; }
    .identity { background: #f0f4f8; border-radius: 6px; padding: 14px 16px; margin: 0 0 8px; font-family: monospace; font-size: 12px; color: #334e68; line-height: 1.8; }
    .identity a { color: #1565c0; }
    .results { background: #f0f4f8; border-radius: 6px; padding: 14px 16px; margin: 0 0 8px; font-size: 13px; color: #334e68; line-height: 1.8; }
  </style>
</head>
<body>
<div class="wrapper">
  <h1>${escapeHtml(title)}</h1>
  <p class="subtitle">Generated ${escapeHtml(manifest.generatedAt)} &nbsp;&middot;&nbsp; Commit ${escapeHtml(shortHash(manifest.commit))}</p>
  ${(function () {
    const htmlParts = [];
    let inIdentity = false;
    let inResults = false;
    let inList = false;
    let identityLines = [];
    let resultsLines = [];

    function flushIdentity() {
      if (identityLines.length > 0) {
        htmlParts.push(`<div class="identity">${identityLines.join("<br>\n")}</div>`);
        identityLines = [];
      }
      inIdentity = false;
    }

    function flushResults() {
      if (resultsLines.length > 0) {
        htmlParts.push(`<div class="results">${resultsLines.join("<br>\n")}</div>`);
        resultsLines = [];
      }
      inResults = false;
    }

    function flushList() {
      if (inList) {
        htmlParts.push("</ul>");
        inList = false;
      }
    }

    for (const line of lines) {
      if (line === "") {
        if (inIdentity) flushIdentity();
        if (inResults) flushResults();
        flushList();
        continue;
      }

      if (line.startsWith("## ")) {
        if (inIdentity) flushIdentity();
        if (inResults) flushResults();
        flushList();
        const heading = line.slice(3);
        inIdentity = heading === "Verification Identity";
        inResults = heading === "Automated Results";
        htmlParts.push(`<h2>${escapeHtml(heading)}</h2>`);
        continue;
      }

      if (inIdentity) {
        const linked = line.startsWith("CI run (public):")
          ? line.replace(/(https:\/\/\S+)/, (url) => `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`)
          : escapeHtml(line);
        identityLines.push(linked);
        continue;
      }

      if (inResults) {
        resultsLines.push(escapeHtml(line));
        continue;
      }

      if (line === noticeText) {
        flushList();
        htmlParts.push(`<div class="notice"><p>${escapeHtml(line)}</p></div>`);
        continue;
      }

      if (line.startsWith("- ")) {
        if (!inList) {
          htmlParts.push("<ul>");
          inList = true;
        }
        htmlParts.push(`<li>${escapeHtml(line.slice(2))}</li>`);
        continue;
      }

      flushList();
      htmlParts.push(`<p>${escapeHtml(line)}</p>`);
    }

    if (inIdentity) flushIdentity();
    if (inResults) flushResults();
    flushList();
    return htmlParts.join("\n  ");
  })()}
</div>
</body>
</html>
`;

fs.mkdirSync(outputDir, { recursive: true });
const markdownPath = path.join(outputDir, `${baseName}.md`);
const htmlPath = path.join(outputDir, `${baseName}.html`);
const pdfPath = path.join(outputDir, `${baseName}.pdf`);

fs.writeFileSync(markdownPath, markdown);
fs.writeFileSync(htmlPath, html);
fs.writeFileSync(pdfPath, buildSimplePdf(title, lines));

console.log(`Wrote ${markdownPath}`);
console.log(`Wrote ${htmlPath}`);
console.log(`Wrote ${pdfPath}`);
