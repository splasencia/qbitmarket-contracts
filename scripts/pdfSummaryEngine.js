#!/usr/bin/env node
// Shared PDF/HTML/Markdown rendering engine for summary documents.
//
// Markup language (items in the lines array):
//   ""                     blank line / paragraph break
//   "## Heading"           section heading with rule
//   "## @identity Heading" section heading; body lines use mono font in PDF / identity block in HTML
//   "## @results Heading"  section heading; body lines use check-item HTML rendering
//   "@notice"              next paragraph gets amber bar in PDF / yellow box in HTML
//   "- item"               bullet list item
//   "~pass text"           green check indicator
//   "~fail text"           red cross indicator
//   any other string       body paragraph

"use strict";

function shortHash(value) {
  if (!value || value === "unknown") return "unknown";
  return String(value).slice(0, 12);
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

// Type1 standard fonts only cover printable ASCII + a limited Latin-1 subset.
// Replace typographic characters that render as blanks or garbage in PDF.
function pdfSanitize(value) {
  return String(value)
    .replace(/—/g, " - ")
    .replace(/–/g, "-")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/•/g, "-")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

function renderMarkdown(title, lines) {
  return [
    `# ${title}`,
    "",
    ...lines.map((line) => {
      if (line.startsWith("## @identity ")) return `## ${line.slice(13)}`;
      if (line.startsWith("## @results ")) return `## ${line.slice(12)}`;
      if (line === "@notice") return "";
      if (line.startsWith("~pass ")) return `✓ ${line.slice(6)}`;
      if (line.startsWith("~fail ")) return `✗ ${line.slice(6)}`;
      return line;
    }),
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// HTML renderer
// ---------------------------------------------------------------------------

const HTML_CSS = `
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
    .check { display: flex; align-items: baseline; gap: 10px; margin: 0 0 7px; font-size: 13.5px; color: #334e68; line-height: 1.5; }
    .check-icon { font-weight: 700; font-size: 15px; flex-shrink: 0; line-height: 1; }
    .check-pass .check-icon { color: #1a7f37; }
    .check-fail .check-icon { color: #cf222e; }`;

function renderHtml(title, lines, options = {}) {
  const { generatedAt, commit, subtitleHtml } = options;
  const subtitle =
    subtitleHtml ||
    (generatedAt
      ? `Generated ${escapeHtml(generatedAt)}${commit ? ` &nbsp;&middot;&nbsp; Commit ${escapeHtml(shortHash(commit))}` : ""}`
      : "");

  const parts = [];
  let inIdentity = false;
  let inResults = false;
  let inList = false;
  let nextIsNotice = false;
  let identityLines = [];
  let resultsLines = [];

  function flushIdentity() {
    if (identityLines.length > 0) {
      parts.push(`<div class="identity">${identityLines.join("<br>\n")}</div>`);
      identityLines = [];
    }
    inIdentity = false;
  }

  function flushResults() {
    if (resultsLines.length > 0) {
      const hasChecks = resultsLines.some((l) => l.startsWith('<div class="check'));
      if (hasChecks) {
        parts.push(resultsLines.join("\n  "));
      } else {
        parts.push(`<div class="results">${resultsLines.join("<br>\n")}</div>`);
      }
      resultsLines = [];
    }
    inResults = false;
  }

  function flushList() {
    if (inList) {
      parts.push("</ul>");
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

    if (line === "@notice") {
      nextIsNotice = true;
      continue;
    }

    const isIdentityHeading = line.startsWith("## @identity ");
    const isResultsHeading = line.startsWith("## @results ");
    const isHeading = line.startsWith("## ") || isIdentityHeading || isResultsHeading;

    if (isHeading) {
      if (inIdentity) flushIdentity();
      if (inResults) flushResults();
      flushList();
      const heading = isIdentityHeading ? line.slice(13) : isResultsHeading ? line.slice(12) : line.slice(3);
      inIdentity = isIdentityHeading;
      inResults = isResultsHeading;
      parts.push(`<h2>${escapeHtml(heading)}</h2>`);
      continue;
    }

    if (inIdentity) {
      const linked = line.includes("https://")
        ? line.replace(/(https:\/\/\S+)/g, (url) => `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`)
        : escapeHtml(line);
      identityLines.push(linked);
      continue;
    }

    if (inResults) {
      if (line.startsWith("~pass ") || line.startsWith("~fail ")) {
        const isPass = line.startsWith("~pass ");
        const icon = isPass ? "✓" : "✗";
        const cls = isPass ? "check check-pass" : "check check-fail";
        resultsLines.push(`<div class="${cls}"><span class="check-icon">${icon}</span><span>${escapeHtml(line.slice(6))}</span></div>`);
      } else {
        resultsLines.push(`<span>${escapeHtml(line)}</span>`);
      }
      continue;
    }

    if (line.startsWith("~pass ") || line.startsWith("~fail ")) {
      flushList();
      const isPass = line.startsWith("~pass ");
      const icon = isPass ? "✓" : "✗";
      const cls = isPass ? "check check-pass" : "check check-fail";
      parts.push(`<div class="${cls}"><span class="check-icon">${icon}</span><span>${escapeHtml(line.slice(6))}</span></div>`);
      continue;
    }

    if (nextIsNotice) {
      flushList();
      nextIsNotice = false;
      parts.push(`<div class="notice"><p>${escapeHtml(line)}</p></div>`);
      continue;
    }

    if (line.startsWith("- ")) {
      if (!inList) {
        parts.push("<ul>");
        inList = true;
      }
      parts.push(`<li>${escapeHtml(line.slice(2))}</li>`);
      continue;
    }

    flushList();
    parts.push(`<p>${escapeHtml(line)}</p>`);
  }

  if (inIdentity) flushIdentity();
  if (inResults) flushResults();
  flushList();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>${HTML_CSS}
  </style>
</head>
<body>
<div class="wrapper">
  <h1>${escapeHtml(title)}</h1>
  ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ""}
  ${parts.join("\n  ")}
</div>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// PDF renderer
// ---------------------------------------------------------------------------

function buildSimplePdf(title, lines, options = {}) {
  const { generatedAt, commit } = options;
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 46;
  const marginY = 54;
  const textWidth = pageWidth - marginX * 2;
  const lhBody = 15;
  const lhMono = 13;
  const gapParagraph = 12;
  const gapBeforeHeading = 18;
  const gapHeadingToRule = 7;
  const gapRuleToBody = 18;
  const bulletGap = 4;
  const allPages = [];
  let commands = [];
  let y = pageHeight - marginY;
  let inIdentity = false;
  let nextIsNotice = false;
  let prevWasBullet = false;
  let monoBlockStartY = null;
  let monoLh = lhMono;

  function newPage() {
    flushMonoBorder();
    if (commands.length > 0) allPages.push(commands);
    commands = [];
    y = pageHeight - marginY;
  }

  function ensureSpace(needed) {
    if (y - needed < marginY) newPage();
  }

  function txt(str, x, yPos, font, size) {
    commands.push(`BT ${font} ${size} Tf ${x} ${yPos} Td (${pdfEscape(pdfSanitize(str))}) Tj ET`);
  }

  function hRule(yPos) {
    commands.push(`q 0.75 G 0.5 w ${marginX} ${yPos} m ${pageWidth - marginX} ${yPos} l S Q`);
  }

  function amberBar(xPos, yBottom, height) {
    commands.push(`q 0.94 0.71 0.16 rg ${xPos} ${yBottom} 4 ${height} re f Q`);
  }

  function flushMonoBorder() {
    if (monoBlockStartY === null) return;
    const pad = 5;
    const lastBaseline = y + monoLh;
    const yBottom = lastBaseline - pad - 3;
    const height = monoBlockStartY - lastBaseline + pad * 2 + 11;
    commands.push(`q 0.78 G 0.5 w ${marginX - 6} ${yBottom} ${textWidth + 12} ${height} re S Q`);
    monoBlockStartY = null;
  }

  // Title block
  ensureSpace(50);
  txt(title, marginX, y, "/F2", 17);
  y -= 21;
  const genDate = generatedAt ? new Date(generatedAt).toISOString().slice(0, 10) : "";
  const sc = shortHash(commit || "unknown");
  const subtitle = genDate ? `${genDate}${sc !== "unknown" ? "   commit " + sc : ""}` : "";
  if (subtitle) {
    txt(subtitle, marginX, y, "/F1", 9);
    y -= 12;
  }
  hRule(y - 3);
  y -= 16;

  for (const item of lines) {
    if (item === "") {
      flushMonoBorder();
      inIdentity = false;
      nextIsNotice = false;
      prevWasBullet = false;
      y -= gapParagraph;
      continue;
    }

    if (item === "@notice") {
      nextIsNotice = true;
      continue;
    }

    const isIdentityHeading = item.startsWith("## @identity ");
    const isResultsHeading = item.startsWith("## @results ");
    const isHeading = item.startsWith("## ") || isIdentityHeading || isResultsHeading;

    if (isHeading) {
      flushMonoBorder();
      const heading = isIdentityHeading ? item.slice(13) : isResultsHeading ? item.slice(12) : item.slice(3);
      inIdentity = isIdentityHeading;
      nextIsNotice = false;
      prevWasBullet = false;
      y -= gapBeforeHeading;
      ensureSpace(30);
      txt(heading.toUpperCase(), marginX, y, "/F2", 11);
      y -= gapHeadingToRule;
      hRule(y);
      y -= gapRuleToBody;
      continue;
    }

    const isPass = item.startsWith("~pass ");
    const isFail = item.startsWith("~fail ");
    if (isPass || isFail) {
      const rawText = item.slice(6);
      const wrapped = wrapText(rawText, 103);
      const blockH = wrapped.length * lhBody;
      if (prevWasBullet) y -= bulletGap;
      ensureSpace(blockH);
      const sqSize = 6;
      const sqY = y - 1;
      const color = isPass ? "0.13 0.55 0.24" : "0.75 0.15 0.15";
      commands.push(`q ${color} rg ${marginX} ${sqY} ${sqSize} ${sqSize} re f Q`);
      for (const [i, line] of wrapped.entries()) {
        txt(line, marginX + sqSize + 5, y, "/F1", 10);
        y -= lhBody;
      }
      prevWasBullet = true;
      continue;
    }

    const isBullet = item.startsWith("- ");
    const rawText = isBullet ? item.slice(2) : item;
    const isNotice = nextIsNotice && !isBullet;
    const isMono = inIdentity && !isBullet;

    const font = isMono ? "/F3" : "/F1";
    const size = isMono ? 9 : 10;
    const lh = isMono ? lhMono : lhBody;
    const wrapW = isMono ? 95 : isBullet ? 103 : isNotice ? 105 : 108;
    const indentX = isBullet ? 14 : isNotice ? 16 : isMono ? 6 : 0;

    const wrapped = wrapText(rawText, wrapW);
    const blockH = wrapped.length * lh;

    ensureSpace(blockH + (isNotice ? 8 : 0));

    if (isNotice) {
      amberBar(marginX, y - blockH + lh - 4, blockH - lh + 12);
    }

    if (isMono && monoBlockStartY === null) {
      monoBlockStartY = y;
      monoLh = lh;
    }

    if (isBullet && prevWasBullet) y -= bulletGap;

    for (const [i, line] of wrapped.entries()) {
      const prefix = isBullet ? (i === 0 ? "- " : "  ") : "";
      txt(`${prefix}${line}`, marginX + indentX, y, font, size);
      y -= lh;
    }

    prevWasBullet = isBullet;
    if (isNotice) nextIsNotice = false;
  }

  flushMonoBorder();
  if (commands.length > 0) allPages.push(commands);

  const objects = [];
  function addObject(body) {
    objects.push(body);
    return objects.length;
  }

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("PAGES_PLACEHOLDER");
  const f1Id = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const f2Id = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const f3Id = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  const pageIds = [];

  for (const pageCommands of allPages) {
    const stream = pageCommands.join("\n");
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
        `/Resources << /Font << /F1 ${f1Id} 0 R /F2 ${f2Id} 0 R /F3 ${f3Id} 0 R >> >> /Contents ${contentId} 0 R >>`
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
  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  return Buffer.from(chunks.join(""), "utf8");
}

module.exports = { shortHash, escapeHtml, wrapText, pdfEscape, pdfSanitize, renderMarkdown, renderHtml, buildSimplePdf };
