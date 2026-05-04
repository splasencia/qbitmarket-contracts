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
const lines = [
  "## Purpose",
  "This shareable summary records the automated verification evidence generated for the public qbitmarket contracts repository. It is intended for users, partners, and reviewers who need a concise view of the security process without reading the full technical evidence bundle.",
  "",
  "## Important Limitation",
  "This is not a paid or formal third-party audit certificate. It summarizes automated static analysis, bounded symbolic analysis, regression tests, invariant-style tests, source hashing, and documented triage for a specific public commit.",
  "",
  "## Evidence Identity",
  `Generated at: ${manifest.generatedAt}`,
  `Public commit: ${shortHash(manifest.commit)} (${manifest.commit || "unknown"})`,
  `Git ref: ${manifest.ref || "unknown"}`,
  `Repository: ${manifest.repository || "unknown"}`,
  runUrl ? `GitHub Actions run: ${runUrl}` : "GitHub Actions run: unavailable in local generation",
  "",
  "## What Was Checked",
  "- Release Hardhat test suite, including lifecycle, payment-token policy, reentrancy, invalidation, and invariant-style regression tests.",
  "- Slither static-analysis baseline, with accepted findings documented and gated by policy.",
  "- Mythril bounded symbolic-analysis baseline against compiled marketplace bytecode artifacts.",
  "- Source, ABI, bundled source, and compiled artifact hashes for reproducibility.",
  "- Deployment verification manifests when present in the evidence bundle.",
  "",
  "## Automated Results",
  `Slither reports: ${slitherReports.length}`,
  `Slither detector results: ${slitherDetectorCount}`,
  `Slither impacts: ${formatCounts(slitherImpacts)}`,
  `Mythril reports: ${mythrilReports.length}`,
  `Mythril issues: ${mythrilIssueCount}`,
  `Mythril severities: ${formatCounts(mythrilSeverities)}`,
  `Slither triage gate: ${manifest.reports?.slitherTriageGate ? "present" : "missing"}`,
  "",
  "## Reproducibility Evidence",
  `Source and test files hashed: ${sourceCount}`,
  `Bundled deployment source files hashed: ${bundledCount}`,
  `ABI files hashed: ${abiCount}`,
  `Compiled Hardhat artifacts hashed: ${artifactCount}`,
  `Deployment verification manifests included: ${verificationManifestCount}`,
  "",
  "## Security Controls Covered",
  "- Owner-only configuration and fee caps for privileged marketplace settings.",
  "- Native and ERC-20 escrow conservation for offers and auctions.",
  "- ERC-20 payment-token policy: native token support, factory-created tokens, and owner-approved external tokens.",
  "- Reentrancy hardening for malicious ERC-20, ERC-721, and ERC-1155 callback attempts.",
  "- Listing, offer, and auction lifecycle guards for cancelled, expired, reused, underpaid, overpaid, unapproved, and balance-lost states.",
  "- Pause behavior for critical marketplace actions while keeping cancellation paths available.",
  "- Upgradeability checks for the primary proxy and documented admin ownership procedures.",
  "",
  "## Known Boundaries",
  "- Automated tooling is not a mathematical proof and cannot guarantee absence of vulnerabilities.",
  "- Long-running Echidna or Foundry invariant campaigns are recommended before significant-funds mainnet usage.",
  "- Mainnet-fork testing with unusual ERC-20s is still a future mainnet-readiness step.",
  "- Accepted Slither findings remain visible in the evidence bundle and must be read with the triage document.",
  "",
  "## Supporting Files",
  "- audit-evidence-manifest.json",
  "- audit-evidence-summary.md",
  "- audit-triage.md",
  "- invariant-tests.md",
  "- operational-authority.md",
  "- publication-model.md",
  "- slither and Mythril JSON reports",
];

const markdown = [
  `# ${title}`,
  "",
  ...lines.map((line) => (line.startsWith("## ") || line.startsWith("- ") || line === "" ? line : `- ${line}`)),
  "",
].join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1f2933; margin: 48px; line-height: 1.45; }
    h1 { font-size: 30px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 28px; border-bottom: 1px solid #d9e2ec; padding-bottom: 6px; }
    p, li { font-size: 13px; }
    .notice { background: #fff7e6; border: 1px solid #f5c26b; padding: 12px 14px; border-radius: 6px; }
    .meta { color: #52606d; font-size: 12px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Generated at ${escapeHtml(manifest.generatedAt)} for commit ${escapeHtml(shortHash(manifest.commit))}</p>
  ${lines
    .map((line) => {
      if (line === "") return "";
      if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (line.startsWith("- ")) return `<p>&bull; ${escapeHtml(line.slice(2))}</p>`;
      if (line === "This is not a paid or formal third-party audit certificate. It summarizes automated static analysis, bounded symbolic analysis, regression tests, invariant-style tests, source hashing, and documented triage for a specific public commit.") {
        return `<p class="notice">${escapeHtml(line)}</p>`;
      }
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n")}
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
