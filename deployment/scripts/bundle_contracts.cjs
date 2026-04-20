#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const IMPORT_STATEMENT_PATTERN = /^\s*import\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["'];\s*$/;
const SPDX_PATTERN = /^\s*\/\/\s*SPDX-License-Identifier:\s*(.+?)\s*$/;
const PRAGMA_PATTERN = /^\s*pragma\s+solidity\s+([^;]+);\s*$/;

function ensureDirectoryExists(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function listRootSolidityFiles(directoryPath) {
  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sol"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function findSourceContractsDirectory(outputDirectory) {
  const configuredSourceDirectory = process.env.BUNDLE_SOURCE_DIR;
  if (configuredSourceDirectory) {
    const resolvedConfiguredSourceDirectory = path.resolve(configuredSourceDirectory);
    if (listRootSolidityFiles(resolvedConfiguredSourceDirectory).length === 0) {
      throw new Error(
        `BUNDLE_SOURCE_DIR does not contain root Solidity files: ${resolvedConfiguredSourceDirectory}`
      );
    }
    return resolvedConfiguredSourceDirectory;
  }

  let currentDirectory = path.resolve(outputDirectory, "..");
  const filesystemRoot = path.parse(currentDirectory).root;

  while (true) {
    if (listRootSolidityFiles(currentDirectory).length > 0) {
      return currentDirectory;
    }

    if (currentDirectory === filesystemRoot) {
      break;
    }

    currentDirectory = path.dirname(currentDirectory);
  }

  throw new Error(
    `Unable to infer source contracts directory from CONTRACTS_DIR=${outputDirectory}. Set BUNDLE_SOURCE_DIR explicitly.`
  );
}

function resolveModulesDirectory(sourceContractsDirectory) {
  const candidates = [
    process.env.MODULES_DIR,
    path.resolve(sourceContractsDirectory, "..", "node_modules"),
    "/app/node_modules",
    path.resolve(process.cwd(), "node_modules"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolvedCandidate = path.resolve(candidate);
    if (fs.existsSync(resolvedCandidate)) {
      return resolvedCandidate;
    }
  }

  throw new Error(
    `Unable to resolve MODULES_DIR. Checked: ${candidates.map((entry) => path.resolve(entry)).join(", ")}`
  );
}

function resolveImportPath(importSpecifier, fromFilePath, modulesDirectory) {
  if (importSpecifier.startsWith(".")) {
    return path.resolve(path.dirname(fromFilePath), importSpecifier);
  }

  return path.resolve(modulesDirectory, importSpecifier);
}

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n");
}

function flattenContract(entryFilePath, sourceContractsDirectory, modulesDirectory) {
  const visitedFiles = new Set();
  const flattenedLines = [];
  let spdxLicenseLine = null;
  let pragmaLine = null;

  function appendFile(filePath) {
    const realFilePath = fs.realpathSync(filePath);
    if (visitedFiles.has(realFilePath)) {
      return;
    }
    visitedFiles.add(realFilePath);

    const fileContents = normalizeNewlines(fs.readFileSync(realFilePath, "utf8"));
    const relativeSourcePath = path.relative(sourceContractsDirectory, realFilePath).replaceAll(path.sep, "/");
    flattenedLines.push(`// File: ${relativeSourcePath}`);

    for (const line of fileContents.split("\n")) {
      const importMatch = line.match(IMPORT_STATEMENT_PATTERN);
      if (importMatch) {
        const importPath = resolveImportPath(importMatch[1], realFilePath, modulesDirectory);
        appendFile(importPath);
        continue;
      }

      if (!spdxLicenseLine) {
        const spdxMatch = line.match(SPDX_PATTERN);
        if (spdxMatch) {
          spdxLicenseLine = `// SPDX-License-Identifier: ${spdxMatch[1]}`;
          continue;
        }
      } else if (line.match(SPDX_PATTERN)) {
        continue;
      }

      if (!pragmaLine) {
        const pragmaMatch = line.match(PRAGMA_PATTERN);
        if (pragmaMatch) {
          pragmaLine = `pragma solidity ${pragmaMatch[1]};`;
          continue;
        }
      } else if (line.match(PRAGMA_PATTERN)) {
        continue;
      }

      flattenedLines.push(line);
    }

    flattenedLines.push("");
  }

  appendFile(entryFilePath);

  const headerLines = [
    spdxLicenseLine || "// SPDX-License-Identifier: MIT",
    pragmaLine || "pragma solidity ^0.8.28;",
    "",
  ];

  const combinedLines = [...headerLines, ...flattenedLines];
  const normalizedOutput = combinedLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  return normalizedOutput;
}

function main() {
  const outputDirectory = process.env.CONTRACTS_DIR
    ? path.resolve(process.env.CONTRACTS_DIR)
    : path.resolve("/contracts/bundled_contracts");
  const sourceContractsDirectory = findSourceContractsDirectory(outputDirectory);
  const modulesDirectory = resolveModulesDirectory(sourceContractsDirectory);
  const solidityFiles = listRootSolidityFiles(sourceContractsDirectory);

  if (solidityFiles.length === 0) {
    throw new Error(`No Solidity entry files found in source directory: ${sourceContractsDirectory}`);
  }

  ensureDirectoryExists(outputDirectory);

  for (const fileName of solidityFiles) {
    const sourceFilePath = path.join(sourceContractsDirectory, fileName);
    const outputFilePath = path.join(outputDirectory, fileName);
    const flattenedSource = flattenContract(sourceFilePath, sourceContractsDirectory, modulesDirectory);
    fs.writeFileSync(outputFilePath, flattenedSource, "utf8");
    console.log(`Bundled ${fileName} -> ${outputFilePath}`);
  }

  console.log(`Bundled ${solidityFiles.length} contract source file(s).`);
  console.log(`Source contracts directory: ${sourceContractsDirectory}`);
  console.log(`Modules directory: ${modulesDirectory}`);
  console.log(`Output directory: ${outputDirectory}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
