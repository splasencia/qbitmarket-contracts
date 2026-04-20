import fs from "fs-extra";
import path from "path";
import yaml from "js-yaml";
import { fileURLToPath } from "url";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATE_DEPLOYMENT_ROOT_DIR = path.resolve(APP_DIR, "..");
const DEPLOYMENT_ROOT_DIR =
  fs.existsSync(path.join(CANDIDATE_DEPLOYMENT_ROOT_DIR, "state"))
    ? CANDIDATE_DEPLOYMENT_ROOT_DIR
    : APP_DIR;

function resolveFromDeploymentRoot(configuredPath) {
  if (configuredPath === undefined || configuredPath === null || configuredPath === "") {
    return "";
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(DEPLOYMENT_ROOT_DIR, configuredPath);
}

function getConfiguredStateDirectory() {
  return (
    resolveFromDeploymentRoot(process.env.ADDRESSBOOK_DIR) ||
    resolveFromDeploymentRoot(process.env.DEPLOYMENT_STATE_DIR)
  );
}

export function resolveAddressBookPath(contractsDir) {
  const configuredPath = resolveFromDeploymentRoot(process.env.ADDRESSBOOK_PATH);
  if (configuredPath) {
    return configuredPath;
  }

  const configuredStateDirectory = getConfiguredStateDirectory();
  if (configuredStateDirectory) {
    return path.join(configuredStateDirectory, "address-book.yml");
  }

  return path.join(contractsDir, "address-book.yml");
}

export function loadAddressBook(contractsDir) {
  const addressBookPath = resolveAddressBookPath(contractsDir);
  if (fs.existsSync(addressBookPath) === false) {
    return {};
  }

  return yaml.load(fs.readFileSync(addressBookPath, "utf8"), { schema: yaml.FAILSAFE_SCHEMA }) || {};
}

export function saveAddressBook(contractsDir, addressBook) {
  const addressBookPath = resolveAddressBookPath(contractsDir);
  fs.ensureDirSync(path.dirname(addressBookPath));
  fs.writeFileSync(addressBookPath, yaml.dump(addressBook, { sortKeys: true }));
  return addressBookPath;
}

export function resolveVerificationManifestPath(contractsDir) {
  const configuredPath = resolveFromDeploymentRoot(process.env.VERIFICATION_MANIFEST_PATH);
  if (configuredPath) {
    return configuredPath;
  }

  const configuredStateDirectory = getConfiguredStateDirectory();
  if (configuredStateDirectory) {
    return path.join(configuredStateDirectory, "verification-manifest.json");
  }

  return path.join(contractsDir, "verification-manifest.json");
}

export function loadVerificationManifest(contractsDir) {
  const manifestPath = resolveVerificationManifestPath(contractsDir);
  if (fs.existsSync(manifestPath) === false) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return parsed && typeof parsed === "object" && Array.isArray(parsed) === false ? parsed : {};
  } catch {
    return {};
  }
}

export function saveVerificationManifest(contractsDir, manifest) {
  const manifestPath = resolveVerificationManifestPath(contractsDir);
  fs.ensureDirSync(path.dirname(manifestPath));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifestPath;
}
