import fs from "fs-extra";
import path from "path";
import yaml from "js-yaml";
import { fileURLToPath } from "url";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATE_DEPLOYMENT_ROOT_DIR = path.resolve(APP_DIR, "..");
const DEPLOYMENT_ROOT_DIR =
  fs.existsSync(path.join(CANDIDATE_DEPLOYMENT_ROOT_DIR, "state")) ||
  fs.existsSync(path.join(CANDIDATE_DEPLOYMENT_ROOT_DIR, "env"))
    ? CANDIDATE_DEPLOYMENT_ROOT_DIR
    : APP_DIR;
const CONTRACT_TFVARS_FIELD_BY_NAME = {
  Marketplace: "marketplace_address",
  MarketplaceV2: "marketplace_v2_address",
  MarketplaceSecondaryERC721: "marketplace_secondary_erc721_address",
  MarketplaceSecondaryERC1155: "marketplace_secondary_erc1155_address",
  MarketplacePrimaryImplementation: "marketplace_primary_implementation_address",
  MarketplacePrimaryProxyAdmin: "marketplace_primary_proxy_admin_address",
  MarketplacePrimaryProxy: "marketplace_primary_proxy_address",
  ERC721CollectionDeployer: "erc721_collection_deployer_address",
  ERC1155CollectionDeployer: "erc1155_collection_deployer_address",
  CollectionFactory: "collection_factory_address",
  PaymentTokenFactory: "payment_token_factory_address",
};
const CONTRACT_DEPLOY_BLOCK_TFVARS_FIELD_BY_NAME = {
  Marketplace: "marketplace_deploy_block",
  MarketplaceV2: "marketplace_v2_deploy_block",
  MarketplaceSecondaryERC721: "marketplace_secondary_erc721_deploy_block",
  MarketplaceSecondaryERC1155: "marketplace_secondary_erc1155_deploy_block",
  MarketplacePrimaryImplementation: "marketplace_primary_implementation_deploy_block",
  MarketplacePrimaryProxyAdmin: "marketplace_primary_proxy_admin_deploy_block",
  MarketplacePrimaryProxy: "marketplace_primary_proxy_deploy_block",
  ERC721CollectionDeployer: "erc721_collection_deployer_deploy_block",
  ERC1155CollectionDeployer: "erc1155_collection_deployer_deploy_block",
  CollectionFactory: "collection_factory_deploy_block",
  PaymentTokenFactory: "payment_token_factory_deploy_block",
};
const CONTRACT_NAME_BY_DEPLOY_BLOCK_TFVARS_FIELD = Object.fromEntries(
  Object.entries(CONTRACT_DEPLOY_BLOCK_TFVARS_FIELD_BY_NAME).map(([contractName, tfvarsField]) => [
    tfvarsField,
    contractName,
  ])
);
const INDEXER_START_BLOCK_TFVARS_FIELD = "qbitmarket_indexer_start_block";
const INDEXER_START_BLOCK_MARGIN = 20;
const INDEXER_START_BLOCK_CONTRACTS = [
  "Marketplace",
  "MarketplaceV2",
  "MarketplaceSecondaryERC721",
  "MarketplaceSecondaryERC1155",
  "CollectionFactory",
  "PaymentTokenFactory",
];

function normalizeDeployBlock(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }

  return null;
}

function loadExistingTerraformContractsOutput(outputPath) {
  if (fs.existsSync(outputPath) === false) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    return parsed && typeof parsed === "object" && Array.isArray(parsed) === false ? parsed : {};
  } catch {
    return {};
  }
}

function getExistingDeployBlocksByName(existingPayload) {
  return Object.entries(CONTRACT_NAME_BY_DEPLOY_BLOCK_TFVARS_FIELD).reduce((accumulator, [tfvarsField, contractName]) => {
    const normalizedBlock = normalizeDeployBlock(existingPayload[tfvarsField]);
    if (normalizedBlock !== null) {
      accumulator[contractName] = normalizedBlock;
    }
    return accumulator;
  }, {});
}

function buildTerraformContractsPayload({
  addressBook,
  deploymentBlocksByName,
  environmentName,
  existingPayload,
}) {
  const payload = {};
  const effectiveDeployBlocksByName = {
    ...getExistingDeployBlocksByName(existingPayload),
    ...Object.entries(deploymentBlocksByName || {}).reduce((accumulator, [contractName, blockNumber]) => {
      const normalizedBlock = normalizeDeployBlock(blockNumber);
      if (normalizedBlock !== null) {
        accumulator[contractName] = normalizedBlock;
      }
      return accumulator;
    }, {}),
  };

  if (environmentName) {
    payload.qbitmarket_env = environmentName;
  }

  Object.entries(CONTRACT_TFVARS_FIELD_BY_NAME).forEach(([contractName, tfvarsField]) => {
    const address = addressBook[contractName];
    if (typeof address === "string" && address.trim()) {
      payload[tfvarsField] = address.trim();
    }
  });

  Object.entries(CONTRACT_DEPLOY_BLOCK_TFVARS_FIELD_BY_NAME).forEach(([contractName, tfvarsField]) => {
    const deployBlock = effectiveDeployBlocksByName[contractName];
    if (deployBlock !== undefined) {
      payload[tfvarsField] = deployBlock;
    }
  });

  const relevantDeployBlocks = INDEXER_START_BLOCK_CONTRACTS.map(
    (contractName) => effectiveDeployBlocksByName[contractName]
  ).filter((blockNumber) => Number.isInteger(blockNumber));

  if (relevantDeployBlocks.length > 0) {
    payload[INDEXER_START_BLOCK_TFVARS_FIELD] = Math.max(
      0,
      Math.min(...relevantDeployBlocks) - INDEXER_START_BLOCK_MARGIN
    );
  } else {
    const normalizedExistingStartBlock = normalizeDeployBlock(existingPayload[INDEXER_START_BLOCK_TFVARS_FIELD]);
    if (normalizedExistingStartBlock !== null) {
      payload[INDEXER_START_BLOCK_TFVARS_FIELD] = normalizedExistingStartBlock;
    }
  }

  return payload;
}

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

export function resolveTerraformContractsOutputPath(contractsDir) {
  const configuredPath = resolveFromDeploymentRoot(process.env.TFVARS_OUTPUT_PATH);
  if (configuredPath) {
    return configuredPath;
  }

  const configuredDirectory = resolveFromDeploymentRoot(process.env.TFVARS_OUTPUT_DIR);
  if (configuredDirectory) {
    return path.join(configuredDirectory, "contracts.auto.tfvars.json");
  }

  const configuredStateDirectory = getConfiguredStateDirectory();
  if (configuredStateDirectory) {
    return path.join(configuredStateDirectory, "contracts.auto.tfvars.json");
  }

  return path.join(contractsDir, "contracts.auto.tfvars.json");
}

export function writeTerraformContractsOutput(contractsDir, addressBook, deploymentBlocksByName = {}) {
  const outputPath = resolveTerraformContractsOutputPath(contractsDir);
  const environmentName = String(process.env.QBITMARKET_ENV || "").trim();
  const existingPayload = loadExistingTerraformContractsOutput(outputPath);
  const payload = buildTerraformContractsPayload({
    addressBook,
    deploymentBlocksByName,
    environmentName,
    existingPayload,
  });

  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return outputPath;
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
