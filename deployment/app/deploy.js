import dotenv from "dotenv";
import fs from "fs-extra";
import path from "path";
import { ethers } from "ethers";
import { execSync } from "child_process";
import {
  loadAddressBook as loadDeploymentAddressBook,
  loadVerificationManifest as loadDeploymentVerificationManifest,
  resolveAddressBookPath,
  resolveTerraformContractsOutputPath,
  resolveVerificationManifestPath,
  saveAddressBook as saveDeploymentAddressBook,
  saveVerificationManifest as saveDeploymentVerificationManifest,
  writeTerraformContractsOutput,
} from "./statePaths.js";

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function requireAddress(value, label) {
  if (!value || !ethers.utils.isAddress(value)) {
    throw new Error(`Invalid address for ${label}: ${value}`);
  }
  return value;
}

function parseBps(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing environment variable: ${label}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) {
    throw new Error(`Invalid basis points for ${label}: ${value}`);
  }

  return parsed;
}

function getConfiguredAddress(name, fallback) {
  const configured = process.env[name];
  return configured ? requireAddress(configured, name) : fallback;
}

function getOptionalConfiguredAddress(names) {
  const envNames = Array.isArray(names) ? names : [names];

  for (const name of envNames) {
    const configured = process.env[name];
    if (configured !== undefined && configured !== "") {
      return requireAddress(configured, name);
    }
  }

  return null;
}

function parseAddressList(value, label) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return [];
  }

  const trimmed = String(value).trim();
  let entries;
  if (trimmed.startsWith("[")) {
    try {
      entries = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Invalid JSON address list for ${label}: ${error.message}`);
    }

    if (!Array.isArray(entries)) {
      throw new Error(`Invalid address list for ${label}: expected a JSON array.`);
    }
  } else {
    entries = trimmed.split(",");
  }

  const normalized = [];
  const seen = new Set();
  for (const entry of entries) {
    const address = String(entry || "").trim();
    if (!address) {
      continue;
    }

    const checkedAddress = requireAddress(address, label);
    const key = checkedAddress.toLowerCase();
    if (!seen.has(key)) {
      normalized.push(checkedAddress);
      seen.add(key);
    }
  }

  return normalized;
}

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean env value: ${value}`);
}

function parseCollectionFactoryMarketplaceMode(rawValue) {
  const normalized = String(rawValue || "legacy").trim().toLowerCase();
  if (normalized === "legacy" || normalized === "primary_proxy") {
    return normalized;
  }

  throw new Error(
    `Invalid COLLECTION_FACTORY_MARKETPLACE_MODE: ${rawValue}. Supported values: legacy, primary_proxy.`
  );
}

// Directories
const CONTRACTS_DIR = process.env.CONTRACTS_DIR; // Symbolic link created by Dockerfile
const ABI_DIR = process.env.ABI_DIR; // Directory for ABI files
const MODULES_DIR = process.env.MODULES_DIR;
const EVM_VERSION = process.env.EVM_VERSION;
const DEFAULT_SOLC_OPTIMIZE_RUNS = process.env.SOLC_OPTIMIZE_RUNS ?? "200";
const SIZE_OPTIMIZED_TARGETS = new Set(
  String(process.env.SOLC_SIZE_OPTIMIZED_TARGETS || "MarketplaceV2,MarketplaceSecondaryERC721,MarketplaceSecondaryERC1155")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
);
const SIZE_OPTIMIZE_RUNS = process.env.SOLC_SIZE_OPTIMIZE_RUNS ?? "1";
const VIA_IR_TARGETS = new Set(
  String(process.env.SOLC_VIA_IR_TARGETS || "MarketplaceV2,MarketplaceSecondaryERC721,MarketplaceSecondaryERC1155")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
);
const LEGACY_CONTRACT_NAMES = ["Multicall3", "NFTCollections", "GuessGame", "GameBase", "NFTMarket"];
const DEPLOYMENT_TARGET_SPECS = {
  Marketplace: {
    files: ["Marketplace.sol"],
    abiContracts: ["Marketplace"],
  },
  MarketplaceV2: {
    files: ["MarketplaceV2.sol"],
    abiContracts: ["MarketplaceV2"],
  },
  MarketplaceSecondaryERC721: {
    files: ["MarketplaceSecondaryERC721.sol"],
    abiContracts: ["MarketplaceSecondaryERC721"],
  },
  MarketplaceSecondaryERC1155: {
    files: ["MarketplaceSecondaryERC1155.sol"],
    abiContracts: ["MarketplaceSecondaryERC1155"],
  },
  MarketplacePrimaryUpgradeable: {
    files: ["MarketplacePrimaryUpgradeable.sol"],
    abiContracts: ["MarketplacePrimaryUpgradeable"],
  },
  ERC721CollectionDeployer: {
    files: ["ERC721CollectionDeployer.sol", "ERC721Collection.sol"],
    abiContracts: ["ERC721CollectionDeployer", "ERC721Collection"],
  },
  ERC1155CollectionDeployer: {
    files: ["ERC1155CollectionDeployer.sol", "ERC1155Collection.sol"],
    abiContracts: ["ERC1155CollectionDeployer", "ERC1155Collection"],
  },
  CollectionFactory: {
    files: ["CollectionFactory.sol"],
    abiContracts: ["CollectionFactory"],
  },
  PaymentTokenFactory: {
    files: ["PaymentTokenFactory.sol", "PaymentToken.sol"],
    abiContracts: ["PaymentTokenFactory", "PaymentToken"],
  },
};
const DEFAULT_DEPLOY_ORDER = [
  "Marketplace",
  "PaymentTokenFactory",
  "MarketplaceV2",
  "ERC721CollectionDeployer",
  "ERC1155CollectionDeployer",
  "CollectionFactory",
];

function serializeForJson(value) {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeForJson(entry));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, serializeForJson(entryValue)])
    );
  }

  return value;
}

// Compile Solidity Contract
function compileContracts(contractsPath, contractFiles) {
  const compiledContracts = {};

  for (const file of contractFiles) {
    const filePath = path.join(contractsPath, file);
    const primaryContractName = path.basename(file, ".sol");
    const optimizeRuns = SIZE_OPTIMIZED_TARGETS.has(primaryContractName)
      ? SIZE_OPTIMIZE_RUNS
      : DEFAULT_SOLC_OPTIMIZE_RUNS;
    const viaIrFlag = VIA_IR_TARGETS.has(primaryContractName) ? " --via-ir" : "";
    console.log(`Compiling ${file}...`);

    try {
      // Run the solc command and capture output
      
      //const command = `solc --evm-version paris --combined-json abi,bin ${filePath}`;
      const command = `solc --optimize --optimize-runs ${optimizeRuns}${viaIrFlag} --base-path . --include-path ${MODULES_DIR} --evm-version ${EVM_VERSION} --combined-json abi,bin ${filePath}`;

      const output = execSync(command, { encoding: "utf8" });

      // Parse the JSON output from solc
      const jsonOutput = JSON.parse(output);

      // Ensure `contracts` field exists
      if (!jsonOutput.contracts) {
        throw new Error(`Unexpected solc output: 'contracts' field is missing.`);
      }

      // Process each contract in the JSON output
      for (const [key, value] of Object.entries(jsonOutput.contracts)) {
        const [sourceName, contractName] = key.split(":");

        // Only save ABI if contract name matches file name (without extension)
        
          compiledContracts[contractName] = {
            abi: value.abi, // Use the ABI directly without JSON.parse
            bytecode: `0x${value.bin}`, // Add the 0x prefix to the bytecode
            sourceName,
            optimizeRuns,
            viaIr: VIA_IR_TARGETS.has(primaryContractName),
          };

          if (contractName === path.basename(file, '.sol')) {

          // Save ABI to ABI directory
          const abiPath = path.join(ABI_DIR, `${contractName}.json`);
          fs.writeFileSync(abiPath, JSON.stringify(value.abi, null, 2), 'utf8');
          console.log(`Saved ABI for ${contractName} to ${abiPath}`);
        }
      }
    } catch (error) {
      // Log errors for debugging
      console.error(`Failed to compile ${file}: ${error.message}`);
      if (error.stdout) {
        console.error(`solc stdout: ${error.stdout}`);
      }
      if (error.stderr) {
        console.error(`solc stderr: ${error.stderr}`);
      }
    }
  }

  // Ensure at least one contract was compiled
  if (Object.keys(compiledContracts).length === 0) {
    throw new Error("No contracts were compiled. Please check your Solidity files.");
  }

  return compiledContracts;
}


async function deployContract(wallet, contractName, contractData, constructorArgs) {

  // Contract deployment
  console.log("Deploying contract...");
  const factory = new ethers.ContractFactory(
    contractData.abi,
    contractData.bytecode,
    wallet
  );

  try {
    
    //Prepare transaction
    const deployTransaction = factory.getDeployTransaction(...constructorArgs);
    
     // Estimate gas for the deployment
    const gasEstimate = await wallet.provider.estimateGas(deployTransaction);

    // Add a 20% buffer to the gas estimate
    const gasLimit = gasEstimate.mul(12).div(10); // Multiply by 1.2 for a 20% increase
    const maxPriorityFeePerGas = ethers.utils.parseUnits('2', 'gwei');
    const maxFeePerGas = ethers.utils.parseUnits('50', 'gwei');

    const contract = await factory.deploy(...constructorArgs, {
      gasLimit,
      maxPriorityFeePerGas,
      maxFeePerGas,
    });
    await contract.deployed();
    const deploymentReceipt = await contract.deployTransaction.wait();
    const deployBlockNumber = deploymentReceipt.blockNumber;

    console.log(`Contract ${contractName} deployed at address: ${contract.address} in block ${deployBlockNumber}`);

    // Save the deployed contract address
    saveAddressToAddressBook(contractName, contract.address, deployBlockNumber);

    return {
      address: contract.address,
      deployBlockNumber,
    };

  } catch (error) {
    throw new Error(`Failed to deploy ${contractName}: ${error.message}`);
  }
}

// Convert ABI to TypeScript
function abiToTypeScript(contractName) {
  const abiPath = path.join(ABI_DIR, `${contractName}.json`);
  const tsPath = path.join(ABI_DIR, `${contractName}.ts`);

  const abi = fs.readFileSync(abiPath, 'utf8').trim();
  const tsContent = `export const ${contractName}Abi = ${abi} as const;`;

  fs.writeFileSync(tsPath, tsContent, 'utf8');
  console.log(`Generated TypeScript ABI for ${contractName}.`);
}


// Save addresses to address book
function saveAddressToAddressBook(contractName, contractAddress, deployBlockNumber = undefined) {
  const addressBookPath = resolveAddressBookPath(CONTRACTS_DIR);
  const addressBook = loadDeploymentAddressBook(CONTRACTS_DIR);

  addressBook[contractName] = contractAddress;

  saveDeploymentAddressBook(CONTRACTS_DIR, addressBook);
  const tfvarsOutputPath = writeTerraformContractsOutput(
    CONTRACTS_DIR,
    addressBook,
    deployBlockNumber === undefined ? {} : { [contractName]: deployBlockNumber }
  );
  console.log(`Saved ${contractName} address to ${addressBookPath}`);
  console.log(`Updated Terraform contract export: ${tfvarsOutputPath}`);
}

function removeLegacyAddressBookEntries() {
  const addressBookPath = resolveAddressBookPath(CONTRACTS_DIR);
  if (!fs.existsSync(addressBookPath)) {
    return;
  }

  const addressBook = loadDeploymentAddressBook(CONTRACTS_DIR);
  let changed = false;

  for (const contractName of LEGACY_CONTRACT_NAMES) {
    if (Object.prototype.hasOwnProperty.call(addressBook, contractName)) {
      delete addressBook[contractName];
      changed = true;
    }
  }

  if (changed) {
    saveDeploymentAddressBook(CONTRACTS_DIR, addressBook);
    const tfvarsOutputPath = writeTerraformContractsOutput(CONTRACTS_DIR, addressBook);
    console.log(`Removed legacy contract addresses from ${addressBookPath}`);
    console.log(`Updated Terraform contract export: ${tfvarsOutputPath}`);
  }
}

function parseDeployTargets() {
  const rawValue = process.env.DEPLOY_ONLY;
  if (!rawValue) {
    return DEFAULT_DEPLOY_ORDER;
  }

  const requestedTargets = rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (requestedTargets.length === 0) {
    throw new Error("DEPLOY_ONLY was provided but no valid contract names were found.");
  }

  const invalidTargets = requestedTargets.filter(
    (target) => !Object.prototype.hasOwnProperty.call(DEPLOYMENT_TARGET_SPECS, target)
  );
  if (invalidTargets.length > 0) {
    throw new Error(
      `Unsupported DEPLOY_ONLY target(s): ${invalidTargets.join(", ")}. Supported values: ${Object.keys(DEPLOYMENT_TARGET_SPECS).join(", ")}.`
    );
  }

  if (requestedTargets.length > 1) {
    console.log(`Deploying selected contracts: ${requestedTargets.join(", ")}`);
  } else {
    console.log(`Deploying only ${requestedTargets[0]} as requested.`);
  }

  return requestedTargets;
}

function getFilesForTargets(targets) {
  return [...new Set(targets.flatMap((target) => DEPLOYMENT_TARGET_SPECS[target].files))];
}

function getAbiContractsForTargets(targets) {
  return [...new Set(targets.flatMap((target) => DEPLOYMENT_TARGET_SPECS[target].abiContracts))];
}

function getPrimaryContractsForTargets(targets) {
  return targets;
}

function loadAddressBook() {
  return loadDeploymentAddressBook(CONTRACTS_DIR);
}

function getExistingDeployedAddress(contractName) {
  const addressBook = loadAddressBook();
  return requireAddress(addressBook[contractName], `address-book.${contractName}`);
}

function hasAddressBookAddress(addressBook, contractName) {
  const value = addressBook[contractName];
  return typeof value === "string" && ethers.utils.isAddress(value);
}

function getAddressBookAddress(contractName) {
  const addressBook = loadAddressBook();
  return hasAddressBookAddress(addressBook, contractName)
    ? requireAddress(addressBook[contractName], `address-book.${contractName}`)
    : null;
}

function isDeploymentAliasProducedByTargets(deploymentTargets, deploymentAlias) {
  if (deploymentTargets.includes(deploymentAlias)) {
    return true;
  }

  if (
    deploymentTargets.includes("MarketplacePrimaryUpgradeable") &&
    [
      "MarketplacePrimaryImplementation",
      "MarketplacePrimaryProxyAdmin",
      "MarketplacePrimaryProxy",
    ].includes(deploymentAlias)
  ) {
    return true;
  }

  return false;
}

function validateDeployTargetDependencies(deploymentTargets, collectionFactoryMarketplaceMode) {
  const addressBook = loadAddressBook();
  const missingDependencies = [];

  const requireAddressOrCurrentTarget = (contractName, reason) => {
    if (
      isDeploymentAliasProducedByTargets(deploymentTargets, contractName) ||
      hasAddressBookAddress(addressBook, contractName)
    ) {
      return;
    }

    missingDependencies.push(`${contractName} (${reason})`);
  };

  if (deploymentTargets.includes("CollectionFactory")) {
    if (collectionFactoryMarketplaceMode === "primary_proxy") {
      requireAddressOrCurrentTarget("MarketplacePrimaryProxy", "CollectionFactory primary_proxy marketplace target");
    } else {
      requireAddressOrCurrentTarget("Marketplace", "CollectionFactory legacy marketplace target");
    }

    requireAddressOrCurrentTarget("ERC721CollectionDeployer", "CollectionFactory ERC-721 deployer");
    requireAddressOrCurrentTarget("ERC1155CollectionDeployer", "CollectionFactory ERC-1155 deployer");
  }

  if (missingDependencies.length > 0) {
    throw new Error(
      "Missing deployment dependencies before deploying anything: " +
        missingDependencies.join(", ") +
        ". Include the dependencies in DEPLOY_ONLY or pass deploymentStateRunId for a prior deploy artifact."
    );
  }
}

function buildVerificationContractId(contractData, fallbackContractName) {
  if (contractData?.sourceName && fallbackContractName) {
    return `${contractData.sourceName}:${fallbackContractName}`;
  }

  return fallbackContractName || null;
}

function normalizeVerificationManifest(existingManifest, deploymentTargets, network) {
  const existingContracts =
    existingManifest?.contracts && typeof existingManifest.contracts === "object" && Array.isArray(existingManifest.contracts) === false
      ? existingManifest.contracts
      : {};

  return {
    ...existingManifest,
    generatedAt: new Date().toISOString(),
    environment: String(process.env.QBITMARKET_ENV || "").trim() || null,
    deploymentTargets: [...deploymentTargets],
    network: {
      chainId: network?.chainId ?? null,
      name: network?.name ?? null,
    },
    compiler: {
      solcOptimizeRunsDefault: DEFAULT_SOLC_OPTIMIZE_RUNS,
      solcOptimizeRunsSizeOptimized: SIZE_OPTIMIZE_RUNS,
      sizeOptimizedTargets: [...SIZE_OPTIMIZED_TARGETS],
      viaIrTargets: [...VIA_IR_TARGETS],
      evmVersion: EVM_VERSION || null,
    },
    contracts: existingContracts,
  };
}

function upsertVerificationManifestEntry(manifest, deploymentAlias, entry) {
  manifest.contracts[deploymentAlias] = serializeForJson({
    ...manifest.contracts[deploymentAlias],
    ...entry,
  });
  const verificationManifestPath = saveDeploymentVerificationManifest(CONTRACTS_DIR, manifest);
  console.log(`Updated verification manifest: ${verificationManifestPath}`);
}

async function deploySecondaryMarketplace({
  wallet,
  compiledContracts,
  verificationManifest,
  deploymentAlias,
  owner,
  feeRecipient,
  feeBps,
  paymentTokenFactoryAddress,
  allowedPaymentTokens = [],
  siteNativeTokenAddress,
  siteNativeTokenFeeBps,
  hasPaymentTokenFactoryAddress,
  hasSiteNativeTokenAddress,
  hasSiteNativeTokenFeeBps,
}) {
  const contractData = compiledContracts[deploymentAlias];
  if (!contractData) {
    throw new Error(`${deploymentAlias} contract was not found in compiled contracts.`);
  }

  const constructorArgs = [owner, feeRecipient, feeBps];
  const deployedContract = await deployContract(wallet, deploymentAlias, contractData, constructorArgs);
  const deployedAddress = deployedContract.address;

  upsertVerificationManifestEntry(verificationManifest, deploymentAlias, {
    address: deployedAddress,
    deployBlockNumber: deployedContract.deployBlockNumber,
    contractName: deploymentAlias,
    verificationContract: buildVerificationContractId(contractData, deploymentAlias),
    constructorArgs,
  });

  const hasAllowedPaymentTokens = allowedPaymentTokens.length > 0;
  if (
    hasPaymentTokenFactoryAddress ||
    hasAllowedPaymentTokens ||
    hasSiteNativeTokenAddress ||
    hasSiteNativeTokenFeeBps
  ) {
    const secondaryMarketplaceContract = new ethers.Contract(deployedAddress, contractData.abi, wallet);
    const postDeployConfiguration = {};

    if (hasPaymentTokenFactoryAddress) {
      const tx = await secondaryMarketplaceContract.setPaymentTokenFactory(paymentTokenFactoryAddress);
      await tx.wait();
      console.log(`Configured ${deploymentAlias} payment-token factory: factory=${paymentTokenFactoryAddress}`);
      postDeployConfiguration.paymentTokenFactoryAddress = paymentTokenFactoryAddress;
    }

    if (hasAllowedPaymentTokens) {
      for (const allowedPaymentToken of allowedPaymentTokens) {
        const tx = await secondaryMarketplaceContract.setPaymentTokenAllowed(allowedPaymentToken, true);
        await tx.wait();
        console.log(`Allowed ${deploymentAlias} external payment token: token=${allowedPaymentToken}`);
      }
      postDeployConfiguration.allowedPaymentTokens = allowedPaymentTokens;
    }

    if (hasSiteNativeTokenAddress && hasSiteNativeTokenFeeBps) {
      const tx = await secondaryMarketplaceContract.setSiteNativePaymentTokenConfig(
        siteNativeTokenAddress,
        siteNativeTokenFeeBps
      );
      await tx.wait();
      console.log(
        `Configured ${deploymentAlias} site-native token and fee: token=${siteNativeTokenAddress}, feeBps=${siteNativeTokenFeeBps}`
      );
    } else if (hasSiteNativeTokenAddress) {
      const tx = await secondaryMarketplaceContract.setSiteNativePaymentToken(siteNativeTokenAddress);
      await tx.wait();
      console.log(`Configured ${deploymentAlias} site-native token: token=${siteNativeTokenAddress}`);
    } else if (hasSiteNativeTokenFeeBps) {
      const tx = await secondaryMarketplaceContract.setSiteNativePaymentTokenFeeBps(siteNativeTokenFeeBps);
      await tx.wait();
      console.log(`Configured ${deploymentAlias} site-native token fee: feeBps=${siteNativeTokenFeeBps}`);
    }

    if (hasSiteNativeTokenAddress || hasSiteNativeTokenFeeBps) {
      postDeployConfiguration.siteNativeTokenAddress = siteNativeTokenAddress;
      postDeployConfiguration.siteNativeTokenFeeBps = siteNativeTokenFeeBps;
      postDeployConfiguration.siteNativeFeeDiscountIntentional = true;
    }

    upsertVerificationManifestEntry(verificationManifest, deploymentAlias, {
      postDeployConfiguration,
    });
  }

  return deployedAddress;
}

async function deployPaymentTokenFactory({
  wallet,
  compiledContracts,
  verificationManifest,
  owner,
}) {
  const contractData = compiledContracts["PaymentTokenFactory"];
  if (!contractData) {
    throw new Error("PaymentTokenFactory contract was not found in compiled contracts.");
  }

  const constructorArgs = [owner];

  const deployedPaymentTokenFactory = await deployContract(wallet, "PaymentTokenFactory", contractData, constructorArgs);
  upsertVerificationManifestEntry(verificationManifest, "PaymentTokenFactory", {
    address: deployedPaymentTokenFactory.address,
    deployBlockNumber: deployedPaymentTokenFactory.deployBlockNumber,
    contractName: "PaymentTokenFactory",
    verificationContract: buildVerificationContractId(contractData, "PaymentTokenFactory"),
    constructorArgs,
  });
  console.log("ERC-20 payment tokens are created later through PaymentTokenFactory.createPaymentToken(...).");

  return deployedPaymentTokenFactory.address;
}

async function requireContractOwners(provider, ownerEntries) {
  const uniqueOwners = new Map();
  for (const [label, address] of ownerEntries) {
    const key = address.toLowerCase();
    const existing = uniqueOwners.get(key);
    uniqueOwners.set(key, existing ? `${existing}, ${label}` : label);
  }

  for (const [address, labels] of uniqueOwners.entries()) {
    const code = await provider.getCode(address);
    if (code === "0x") {
      throw new Error(
        `Owner address must be a deployed contract when REQUIRE_CONTRACT_OWNER_CODE=true: ${labels} -> ${address}`
      );
    }
  }
}

async function readOptionalPendingOwner(contract) {
  try {
    return await contract.pendingOwner();
  } catch {
    return null;
  }
}

async function verifyDeployedOwners({
  provider,
  compiledContracts,
  verificationManifest,
  ownerExpectations,
}) {
  const checkedAtBlock = await provider.getBlockNumber();

  for (const expectation of ownerExpectations) {
    const manifestEntry = verificationManifest.contracts[expectation.deploymentAlias];
    if (!manifestEntry?.address) {
      continue;
    }

    const contractData = compiledContracts[expectation.abiContractName];
    if (!contractData?.abi) {
      console.warn(
        `Skipping owner verification for ${expectation.deploymentAlias}: ABI ${expectation.abiContractName} not available.`
      );
      continue;
    }

    const contract = new ethers.Contract(manifestEntry.address, contractData.abi, provider);
    const actualOwner = await contract.owner();
    const pendingOwner = await readOptionalPendingOwner(contract);
    const matchesExpectedOwner = actualOwner.toLowerCase() === expectation.expectedOwner.toLowerCase();

    if (!matchesExpectedOwner) {
      throw new Error(
        `${expectation.deploymentAlias} owner verification failed: expected ${expectation.expectedOwner}, got ${actualOwner}`
      );
    }

    upsertVerificationManifestEntry(verificationManifest, expectation.deploymentAlias, {
      ownerVerification: {
        expectedOwner: expectation.expectedOwner,
        actualOwner,
        pendingOwner,
        checkedAtBlock,
        matchesExpectedOwner,
      },
    });
    console.log(
      `Verified ${expectation.deploymentAlias} owner: ${actualOwner}` +
        (pendingOwner && pendingOwner !== ethers.constants.AddressZero ? ` (pending: ${pendingOwner})` : "")
    );
  }
}

// Main Function
async function main() {

  // Check environment variables

  const rpcUrl = requireEnv("RPC_URL");
  const privateKey = requireEnv("PRIVATE_KEY");
  const fallbackOwner = requireAddress(process.env.DEPLOYER_ADDRESS, "DEPLOYER_ADDRESS");
  const sharedContractOwner = getOptionalConfiguredAddress(["CONTRACT_OWNER_ADDRESS", "SAFE_OWNER_ADDRESS"]);
  const defaultContractOwner = sharedContractOwner || fallbackOwner;
  const marketplaceOwner = getConfiguredAddress("MARKETPLACE_OWNER_ADDRESS", defaultContractOwner);
  const marketplaceV2Owner = getConfiguredAddress("MARKETPLACE_V2_OWNER_ADDRESS", marketplaceOwner);
  const marketplacePrimaryProxyAdminOwner = getConfiguredAddress(
    "MARKETPLACE_PRIMARY_PROXY_ADMIN_OWNER_ADDRESS",
    marketplaceOwner
  );
  const factoryOwner = getConfiguredAddress("FACTORY_OWNER_ADDRESS", defaultContractOwner);
  const paymentTokenFactoryOwner = getConfiguredAddress("PAYMENT_TOKEN_FACTORY_OWNER_ADDRESS", defaultContractOwner);
  const requireContractOwnerCode = parseBooleanEnv(process.env.REQUIRE_CONTRACT_OWNER_CODE, false);
  const collectionFactoryMarketplaceMode = parseCollectionFactoryMarketplaceMode(
    process.env.COLLECTION_FACTORY_MARKETPLACE_MODE
  );
  const feeRecipient = getConfiguredAddress("FEE_RECIPIENT_ADDRESS", fallbackOwner);
  const marketplaceV2FeeRecipient = getConfiguredAddress("MARKETPLACE_V2_FEE_RECIPIENT_ADDRESS", feeRecipient);
  const primaryMarketplaceFeeBps = parseBps(
    process.env.MARKETPLACE_PLATFORM_FEE_BPS ?? process.env.PLATFORM_FEE_BPS ?? "250",
    "MARKETPLACE_PLATFORM_FEE_BPS|PLATFORM_FEE_BPS"
  );
  const secondaryMarketplaceFeeBps = parseBps(
    process.env.MARKETPLACE_V2_PLATFORM_FEE_BPS ??
      process.env.MARKETPLACE_V2_FEE_BPS ??
      String(primaryMarketplaceFeeBps),
    "MARKETPLACE_V2_PLATFORM_FEE_BPS|MARKETPLACE_V2_FEE_BPS"
  );
  const hasMarketplaceV2SiteNativeTokenAddress =
    process.env.MARKETPLACE_V2_SITE_NATIVE_TOKEN_ADDRESS !== undefined &&
    process.env.MARKETPLACE_V2_SITE_NATIVE_TOKEN_ADDRESS !== "";
  const hasMarketplaceV2SiteNativeTokenFeeBps =
    process.env.MARKETPLACE_V2_SITE_NATIVE_TOKEN_FEE_BPS !== undefined &&
    process.env.MARKETPLACE_V2_SITE_NATIVE_TOKEN_FEE_BPS !== "";
  const marketplaceV2SiteNativeTokenAddress = hasMarketplaceV2SiteNativeTokenAddress
    ? requireAddress(
        process.env.MARKETPLACE_V2_SITE_NATIVE_TOKEN_ADDRESS,
        "MARKETPLACE_V2_SITE_NATIVE_TOKEN_ADDRESS"
      )
    : null;
  const marketplaceV2SiteNativeTokenFeeBps = hasMarketplaceV2SiteNativeTokenFeeBps
    ? parseBps(
        process.env.MARKETPLACE_V2_SITE_NATIVE_TOKEN_FEE_BPS,
        "MARKETPLACE_V2_SITE_NATIVE_TOKEN_FEE_BPS"
      )
    : null;
  if (
    hasMarketplaceV2SiteNativeTokenFeeBps &&
    marketplaceV2SiteNativeTokenFeeBps > secondaryMarketplaceFeeBps
  ) {
    throw new Error(
      "MARKETPLACE_V2_SITE_NATIVE_TOKEN_FEE_BPS must be less than or equal to MARKETPLACE_V2_PLATFORM_FEE_BPS."
    );
  }
  const configuredMarketplaceV2PaymentTokenFactoryAddress = getOptionalConfiguredAddress([
    "MARKETPLACE_V2_PAYMENT_TOKEN_FACTORY_ADDRESS",
    "PAYMENT_TOKEN_FACTORY_ADDRESS",
  ]);
  const marketplaceV2AllowedPaymentTokens = parseAddressList(
    process.env.MARKETPLACE_V2_ALLOWED_PAYMENT_TOKENS,
    "MARKETPLACE_V2_ALLOWED_PAYMENT_TOKENS"
  );

  // Initialize wallet and provider
  let wallet;
  try {
    wallet = new ethers.Wallet(privateKey);
  } catch (error) {
    console.error("Invalid private key!");
    process.exit(1);
  }
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  wallet = wallet.connect(provider);
  const network = await provider.getNetwork();

  if (requireContractOwnerCode) {
    await requireContractOwners(provider, [
      ["MARKETPLACE_OWNER_ADDRESS", marketplaceOwner],
      ["MARKETPLACE_V2_OWNER_ADDRESS", marketplaceV2Owner],
      ["MARKETPLACE_PRIMARY_PROXY_ADMIN_OWNER_ADDRESS", marketplacePrimaryProxyAdminOwner],
      ["FACTORY_OWNER_ADDRESS", factoryOwner],
      ["PAYMENT_TOKEN_FACTORY_OWNER_ADDRESS", paymentTokenFactoryOwner],
    ]);
  }

  // Check wallet balance

  const balance = await wallet.getBalance();
  console.log(`Deployment wallet address: ${wallet.address}`);
  console.log(`Avail. balance: ${ethers.utils.formatEther(balance)} ETH`);
  if (wallet.address.toLowerCase() !== fallbackOwner.toLowerCase()) {
    console.warn(`Warning: DEPLOYER_ADDRESS (${fallbackOwner}) does not match wallet address (${wallet.address}).`);
  }

  // Find Solidity files in the contracts directory

  console.log("Compiling contracts...");
  const deploymentTargets = parseDeployTargets();
  const verificationManifest = normalizeVerificationManifest(
    loadDeploymentVerificationManifest(CONTRACTS_DIR),
    deploymentTargets,
    network
  );

  const contractsPath = path.join(CONTRACTS_DIR);
  const requiredContractFiles = getFilesForTargets(deploymentTargets);
  const contractFiles = requiredContractFiles.filter((file) => fs.existsSync(path.join(contractsPath, file)));

  if (contractFiles.length !== requiredContractFiles.length) {
    const missing = requiredContractFiles.filter((file) => !contractFiles.includes(file));
    throw new Error(`Missing bundled contract files: ${missing.join(", ")}`);
  }

  // Compile all Solidity files in the contracts directory

  const compiledContracts = compileContracts(contractsPath, contractFiles);
  const missingPrimaryContracts = getPrimaryContractsForTargets(deploymentTargets).filter(
    (contractName) => !compiledContracts[contractName]
  );
  if (missingPrimaryContracts.length > 0) {
    throw new Error(
      `Compilation failed for required deploy target(s): ${missingPrimaryContracts.join(", ")}. Aborting before any deployment.`
    );
  }
  removeLegacyAddressBookEntries();
  validateDeployTargetDependencies(deploymentTargets, collectionFactoryMarketplaceMode);

  let marketplaceAddress = null;
  let marketplacePrimaryProxyAddress = null;
  let erc721CollectionDeployerAddress = null;
  let erc1155CollectionDeployerAddress = null;
  let paymentTokenFactoryAddress =
    configuredMarketplaceV2PaymentTokenFactoryAddress || getAddressBookAddress("PaymentTokenFactory");

  if (deploymentTargets.includes("Marketplace")) {
    let contractData = compiledContracts["Marketplace"];
    if (!contractData) {
      throw new Error("Marketplace contract was not found in compiled contracts.");
    }

    let constructorArgs = [
      marketplaceOwner,
      feeRecipient,
      primaryMarketplaceFeeBps,
    ];

    const deployedMarketplace = await deployContract(wallet, "Marketplace", contractData, constructorArgs);
    marketplaceAddress = deployedMarketplace.address;
    upsertVerificationManifestEntry(verificationManifest, "Marketplace", {
      address: deployedMarketplace.address,
      deployBlockNumber: deployedMarketplace.deployBlockNumber,
      contractName: "Marketplace",
      verificationContract: buildVerificationContractId(contractData, "Marketplace"),
      constructorArgs,
    });
  }

  if (deploymentTargets.includes("PaymentTokenFactory")) {
    paymentTokenFactoryAddress = await deployPaymentTokenFactory({
      wallet,
      compiledContracts,
      verificationManifest,
      owner: paymentTokenFactoryOwner,
    });
  }

  const hasMarketplaceV2PaymentTokenFactoryAddress = paymentTokenFactoryAddress !== null;
  if (hasMarketplaceV2SiteNativeTokenAddress && !hasMarketplaceV2PaymentTokenFactoryAddress) {
    const siteNativeTokenIsAllowed = marketplaceV2AllowedPaymentTokens.some(
      (tokenAddress) => tokenAddress.toLowerCase() === marketplaceV2SiteNativeTokenAddress.toLowerCase()
    );

    if (!siteNativeTokenIsAllowed) {
      throw new Error(
        "MARKETPLACE_V2_SITE_NATIVE_TOKEN_ADDRESS requires a payment-token factory or an explicit " +
          "MARKETPLACE_V2_ALLOWED_PAYMENT_TOKENS entry before secondary marketplace deployment."
      );
    }
  }

  if (deploymentTargets.includes("MarketplaceV2")) {
    await deploySecondaryMarketplace(
      {
        wallet,
        compiledContracts,
        verificationManifest,
        deploymentAlias: "MarketplaceV2",
        owner: marketplaceV2Owner,
        feeRecipient: marketplaceV2FeeRecipient,
        feeBps: secondaryMarketplaceFeeBps,
        paymentTokenFactoryAddress,
        allowedPaymentTokens: marketplaceV2AllowedPaymentTokens,
        siteNativeTokenAddress: marketplaceV2SiteNativeTokenAddress,
        siteNativeTokenFeeBps: marketplaceV2SiteNativeTokenFeeBps,
        hasPaymentTokenFactoryAddress: hasMarketplaceV2PaymentTokenFactoryAddress,
        hasSiteNativeTokenAddress: hasMarketplaceV2SiteNativeTokenAddress,
        hasSiteNativeTokenFeeBps: hasMarketplaceV2SiteNativeTokenFeeBps,
      }
    );
  }

  if (deploymentTargets.includes("MarketplaceSecondaryERC721")) {
    await deploySecondaryMarketplace(
      {
        wallet,
        compiledContracts,
        verificationManifest,
        deploymentAlias: "MarketplaceSecondaryERC721",
        owner: marketplaceV2Owner,
        feeRecipient: marketplaceV2FeeRecipient,
        feeBps: secondaryMarketplaceFeeBps,
        paymentTokenFactoryAddress,
        allowedPaymentTokens: marketplaceV2AllowedPaymentTokens,
        siteNativeTokenAddress: marketplaceV2SiteNativeTokenAddress,
        siteNativeTokenFeeBps: marketplaceV2SiteNativeTokenFeeBps,
        hasPaymentTokenFactoryAddress: hasMarketplaceV2PaymentTokenFactoryAddress,
        hasSiteNativeTokenAddress: hasMarketplaceV2SiteNativeTokenAddress,
        hasSiteNativeTokenFeeBps: hasMarketplaceV2SiteNativeTokenFeeBps,
      }
    );
  }

  if (deploymentTargets.includes("MarketplaceSecondaryERC1155")) {
    await deploySecondaryMarketplace(
      {
        wallet,
        compiledContracts,
        verificationManifest,
        deploymentAlias: "MarketplaceSecondaryERC1155",
        owner: marketplaceV2Owner,
        feeRecipient: marketplaceV2FeeRecipient,
        feeBps: secondaryMarketplaceFeeBps,
        paymentTokenFactoryAddress,
        allowedPaymentTokens: marketplaceV2AllowedPaymentTokens,
        siteNativeTokenAddress: marketplaceV2SiteNativeTokenAddress,
        siteNativeTokenFeeBps: marketplaceV2SiteNativeTokenFeeBps,
        hasPaymentTokenFactoryAddress: hasMarketplaceV2PaymentTokenFactoryAddress,
        hasSiteNativeTokenAddress: hasMarketplaceV2SiteNativeTokenAddress,
        hasSiteNativeTokenFeeBps: hasMarketplaceV2SiteNativeTokenFeeBps,
      }
    );
  }

  if (deploymentTargets.includes("MarketplacePrimaryUpgradeable")) {
    const implementationContractData = compiledContracts["MarketplacePrimaryUpgradeable"];
    const proxyAdminContractData = compiledContracts["ProxyAdmin"];
    const proxyContractData = compiledContracts["TransparentUpgradeableProxy"];

    if (!implementationContractData) {
      throw new Error("MarketplacePrimaryUpgradeable contract was not found in compiled contracts.");
    }

    if (!proxyAdminContractData) {
      throw new Error("ProxyAdmin contract was not found in compiled contracts.");
    }

    if (!proxyContractData) {
      throw new Error("TransparentUpgradeableProxy contract was not found in compiled contracts.");
    }

    const deployedImplementation = await deployContract(
      wallet,
      "MarketplacePrimaryImplementation",
      implementationContractData,
      []
    );
    const implementationAddress = deployedImplementation.address;
    upsertVerificationManifestEntry(verificationManifest, "MarketplacePrimaryImplementation", {
      address: implementationAddress,
      deployBlockNumber: deployedImplementation.deployBlockNumber,
      contractName: "MarketplacePrimaryUpgradeable",
      verificationContract: buildVerificationContractId(
        implementationContractData,
        "MarketplacePrimaryUpgradeable"
      ),
      constructorArgs: [],
      upgradeabilityRole: "implementation",
    });

    const proxyAdminConstructorArgs = [];
    const deployedProxyAdmin = await deployContract(
      wallet,
      "MarketplacePrimaryProxyAdmin",
      proxyAdminContractData,
      proxyAdminConstructorArgs
    );
    const proxyAdminAddress = deployedProxyAdmin.address;
    let proxyAdminOwnershipTransfer = null;
    if (marketplacePrimaryProxyAdminOwner.toLowerCase() !== wallet.address.toLowerCase()) {
      const proxyAdminContract = new ethers.Contract(proxyAdminAddress, proxyAdminContractData.abi, wallet);
      const transferOwnershipTx = await proxyAdminContract.transferOwnership(marketplacePrimaryProxyAdminOwner);
      const transferOwnershipReceipt = await transferOwnershipTx.wait();
      proxyAdminOwnershipTransfer = {
        owner: marketplacePrimaryProxyAdminOwner,
        txHash: transferOwnershipReceipt.transactionHash,
      };
      console.log(
        `Transferred MarketplacePrimaryProxyAdmin ownership to ${marketplacePrimaryProxyAdminOwner} in tx ${transferOwnershipReceipt.transactionHash}`
      );
    }
    upsertVerificationManifestEntry(verificationManifest, "MarketplacePrimaryProxyAdmin", {
      address: proxyAdminAddress,
      deployBlockNumber: deployedProxyAdmin.deployBlockNumber,
      contractName: "ProxyAdmin",
      verificationContract: buildVerificationContractId(proxyAdminContractData, "ProxyAdmin"),
      constructorArgs: proxyAdminConstructorArgs,
      upgradeabilityRole: "proxy_admin",
      postDeployConfiguration: {
        owner: proxyAdminOwnershipTransfer?.owner || wallet.address,
        ownershipTransferTxHash: proxyAdminOwnershipTransfer?.txHash || null,
      },
    });

    const implementationInterface = new ethers.utils.Interface(implementationContractData.abi);
    const initializeArgs = [
      marketplaceOwner,
      feeRecipient,
      primaryMarketplaceFeeBps,
    ];
    const initializeData = implementationInterface.encodeFunctionData("initialize", initializeArgs);
    const proxyConstructorArgs = [implementationAddress, proxyAdminAddress, initializeData];

    const deployedProxy = await deployContract(
      wallet,
      "MarketplacePrimaryProxy",
      proxyContractData,
      proxyConstructorArgs
    );
    const proxyAddress = deployedProxy.address;
    marketplacePrimaryProxyAddress = proxyAddress;
    upsertVerificationManifestEntry(verificationManifest, "MarketplacePrimaryProxy", {
      address: proxyAddress,
      deployBlockNumber: deployedProxy.deployBlockNumber,
      contractName: "TransparentUpgradeableProxy",
      verificationContract: buildVerificationContractId(
        proxyContractData,
        "TransparentUpgradeableProxy"
      ),
      constructorArgs: proxyConstructorArgs,
      upgradeabilityRole: "transparent_proxy",
      implementationAddress,
      proxyAdminAddress,
      initializer: {
        functionName: "initialize",
        args: initializeArgs,
        data: initializeData,
      },
    });

    console.log(`MarketplacePrimaryUpgradeable implementation: ${implementationAddress}`);
    console.log(`MarketplacePrimaryUpgradeable proxy admin: ${proxyAdminAddress}`);
    console.log(`MarketplacePrimaryUpgradeable proxy: ${proxyAddress}`);
  }

  if (deploymentTargets.includes("ERC721CollectionDeployer")) {
    let contractData = compiledContracts["ERC721CollectionDeployer"];
    if (!contractData) {
      throw new Error("ERC721CollectionDeployer contract was not found in compiled contracts.");
    }

    const deployedERC721CollectionDeployer = await deployContract(
      wallet,
      "ERC721CollectionDeployer",
      contractData,
      []
    );
    erc721CollectionDeployerAddress = deployedERC721CollectionDeployer.address;
    upsertVerificationManifestEntry(verificationManifest, "ERC721CollectionDeployer", {
      address: erc721CollectionDeployerAddress,
      deployBlockNumber: deployedERC721CollectionDeployer.deployBlockNumber,
      contractName: "ERC721CollectionDeployer",
      verificationContract: buildVerificationContractId(contractData, "ERC721CollectionDeployer"),
      constructorArgs: [],
    });
  }

  if (deploymentTargets.includes("ERC1155CollectionDeployer")) {
    let contractData = compiledContracts["ERC1155CollectionDeployer"];
    if (!contractData) {
      throw new Error("ERC1155CollectionDeployer contract was not found in compiled contracts.");
    }

    const deployedERC1155CollectionDeployer = await deployContract(
      wallet,
      "ERC1155CollectionDeployer",
      contractData,
      []
    );
    erc1155CollectionDeployerAddress = deployedERC1155CollectionDeployer.address;
    upsertVerificationManifestEntry(verificationManifest, "ERC1155CollectionDeployer", {
      address: erc1155CollectionDeployerAddress,
      deployBlockNumber: deployedERC1155CollectionDeployer.deployBlockNumber,
      contractName: "ERC1155CollectionDeployer",
      verificationContract: buildVerificationContractId(contractData, "ERC1155CollectionDeployer"),
      constructorArgs: [],
    });
  }

  if (deploymentTargets.includes("CollectionFactory")) {
    let contractData = compiledContracts["CollectionFactory"];
    if (!contractData) {
      throw new Error("CollectionFactory contract was not found in compiled contracts.");
    }

    const resolvedMarketplaceAddress =
      collectionFactoryMarketplaceMode === "primary_proxy"
        ? (marketplacePrimaryProxyAddress || getExistingDeployedAddress("MarketplacePrimaryProxy"))
        : (marketplaceAddress || getExistingDeployedAddress("Marketplace"));
    const resolvedERC721CollectionDeployerAddress =
      erc721CollectionDeployerAddress || getExistingDeployedAddress("ERC721CollectionDeployer");
    const resolvedERC1155CollectionDeployerAddress =
      erc1155CollectionDeployerAddress || getExistingDeployedAddress("ERC1155CollectionDeployer");

    let constructorArgs = [
      factoryOwner,
      resolvedMarketplaceAddress,
      resolvedERC721CollectionDeployerAddress,
      resolvedERC1155CollectionDeployerAddress,
    ];

    const deployedCollectionFactory = await deployContract(wallet, "CollectionFactory", contractData, constructorArgs);
    const collectionFactoryAddress = deployedCollectionFactory.address;
    upsertVerificationManifestEntry(verificationManifest, "CollectionFactory", {
      address: collectionFactoryAddress,
      deployBlockNumber: deployedCollectionFactory.deployBlockNumber,
      contractName: "CollectionFactory",
      verificationContract: buildVerificationContractId(contractData, "CollectionFactory"),
      constructorArgs,
      rolloutConfig: {
        collectionFactoryMarketplaceMode,
        marketplaceTarget: resolvedMarketplaceAddress,
        erc721CollectionDeployer: resolvedERC721CollectionDeployerAddress,
        erc1155CollectionDeployer: resolvedERC1155CollectionDeployerAddress,
      },
    });
    console.log(
      `CollectionFactory marketplace target mode: ${collectionFactoryMarketplaceMode} (${resolvedMarketplaceAddress})`
    );

    // Wire deployers to factory (R5 — deployer access control).
    // initFactory() is callable once by the deployer initializer, and deploy()
    // is then restricted to msg.sender == factory.
    const erc721DeployerContractData = compiledContracts["ERC721CollectionDeployer"];
    const erc1155DeployerContractData = compiledContracts["ERC1155CollectionDeployer"];
    if (erc721DeployerContractData) {
      const erc721DeployerContract = new ethers.Contract(
        resolvedERC721CollectionDeployerAddress,
        erc721DeployerContractData.abi,
        wallet
      );
      const tx721 = await erc721DeployerContract.initFactory(collectionFactoryAddress);
      await tx721.wait();
      console.log(`ERC721CollectionDeployer.initFactory(${collectionFactoryAddress}) confirmed.`);
    } else {
      console.warn("ERC721CollectionDeployer ABI not available — skipping initFactory. Run the deployer target first.");
    }
    if (erc1155DeployerContractData) {
      const erc1155DeployerContract = new ethers.Contract(
        resolvedERC1155CollectionDeployerAddress,
        erc1155DeployerContractData.abi,
        wallet
      );
      const tx1155 = await erc1155DeployerContract.initFactory(collectionFactoryAddress);
      await tx1155.wait();
      console.log(`ERC1155CollectionDeployer.initFactory(${collectionFactoryAddress}) confirmed.`);
    } else {
      console.warn("ERC1155CollectionDeployer ABI not available — skipping initFactory. Run the deployer target first.");
    }

    console.log("Collections are created later through CollectionFactory.createCollection(...).");
  }

  await verifyDeployedOwners({
    provider,
    compiledContracts,
    verificationManifest,
    ownerExpectations: [
      {
        deploymentAlias: "Marketplace",
        abiContractName: "Marketplace",
        expectedOwner: marketplaceOwner,
      },
      {
        deploymentAlias: "PaymentTokenFactory",
        abiContractName: "PaymentTokenFactory",
        expectedOwner: paymentTokenFactoryOwner,
      },
      {
        deploymentAlias: "MarketplaceV2",
        abiContractName: "MarketplaceV2",
        expectedOwner: marketplaceV2Owner,
      },
      {
        deploymentAlias: "MarketplaceSecondaryERC721",
        abiContractName: "MarketplaceSecondaryERC721",
        expectedOwner: marketplaceV2Owner,
      },
      {
        deploymentAlias: "MarketplaceSecondaryERC1155",
        abiContractName: "MarketplaceSecondaryERC1155",
        expectedOwner: marketplaceV2Owner,
      },
      {
        deploymentAlias: "MarketplacePrimaryProxyAdmin",
        abiContractName: "ProxyAdmin",
        expectedOwner: marketplacePrimaryProxyAdminOwner,
      },
      {
        deploymentAlias: "MarketplacePrimaryProxy",
        abiContractName: "MarketplacePrimaryUpgradeable",
        expectedOwner: marketplaceOwner,
      },
      {
        deploymentAlias: "CollectionFactory",
        abiContractName: "CollectionFactory",
        expectedOwner: factoryOwner,
      },
    ],
  });

  // Convert ABIs to TypeScript and save them to the ABI directory

  const abiContracts = getAbiContractsForTargets(deploymentTargets);
  abiContracts.forEach((contractName) => abiToTypeScript(contractName));

  const finalAddressBook = loadDeploymentAddressBook(CONTRACTS_DIR);
  const tfvarsOutputPath = writeTerraformContractsOutput(CONTRACTS_DIR, finalAddressBook);
  const verificationManifestPath = saveDeploymentVerificationManifest(CONTRACTS_DIR, verificationManifest);
  console.log(`Final address book path: ${resolveAddressBookPath(CONTRACTS_DIR)}`);
  console.log(`Terraform contract export path: ${resolveTerraformContractsOutputPath(CONTRACTS_DIR)}`);
  console.log(`Verification manifest path: ${resolveVerificationManifestPath(CONTRACTS_DIR)}`);
  console.log(`Wrote Terraform contract export: ${tfvarsOutputPath}`);
  console.log(`Wrote verification manifest: ${verificationManifestPath}`);

}

// Run the Main Function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error.message || error);
    process.exit(1);
  });
