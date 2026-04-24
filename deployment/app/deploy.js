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
  "MarketplaceV2",
  "ERC721CollectionDeployer",
  "ERC1155CollectionDeployer",
  "CollectionFactory",
  "PaymentTokenFactory",
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
  siteNativeTokenAddress,
  siteNativeTokenFeeBps,
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

  if (hasSiteNativeTokenAddress || hasSiteNativeTokenFeeBps) {
    const secondaryMarketplaceContract = new ethers.Contract(deployedAddress, contractData.abi, wallet);

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

    upsertVerificationManifestEntry(verificationManifest, deploymentAlias, {
      postDeployConfiguration: {
        siteNativeTokenAddress,
        siteNativeTokenFeeBps,
      },
    });
  }

  return deployedAddress;
}

// Main Function
async function main() {

  // Check environment variables

  const rpcUrl = requireEnv("RPC_URL");
  const privateKey = requireEnv("PRIVATE_KEY");
  const fallbackOwner = requireAddress(process.env.DEPLOYER_ADDRESS, "DEPLOYER_ADDRESS");
  const marketplaceOwner = getConfiguredAddress("MARKETPLACE_OWNER_ADDRESS", fallbackOwner);
  const marketplaceV2Owner = getConfiguredAddress("MARKETPLACE_V2_OWNER_ADDRESS", marketplaceOwner);
  const marketplacePrimaryProxyAdminOwner = marketplaceOwner;
  const factoryOwner = getConfiguredAddress("FACTORY_OWNER_ADDRESS", fallbackOwner);
  const paymentTokenFactoryOwner = getConfiguredAddress("PAYMENT_TOKEN_FACTORY_OWNER_ADDRESS", fallbackOwner);
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
        siteNativeTokenAddress: marketplaceV2SiteNativeTokenAddress,
        siteNativeTokenFeeBps: marketplaceV2SiteNativeTokenFeeBps,
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
        siteNativeTokenAddress: marketplaceV2SiteNativeTokenAddress,
        siteNativeTokenFeeBps: marketplaceV2SiteNativeTokenFeeBps,
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
        siteNativeTokenAddress: marketplaceV2SiteNativeTokenAddress,
        siteNativeTokenFeeBps: marketplaceV2SiteNativeTokenFeeBps,
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
    // Each deployer restricts deploy() to msg.sender == factory, so we call initFactory()
    // on both deployers right after the factory is live. initFactory() is callable only once.
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

  if (deploymentTargets.includes("PaymentTokenFactory")) {
    let contractData = compiledContracts["PaymentTokenFactory"];
    if (!contractData) {
      throw new Error("PaymentTokenFactory contract was not found in compiled contracts.");
    }

    let constructorArgs = [paymentTokenFactoryOwner];

    const deployedPaymentTokenFactory = await deployContract(wallet, "PaymentTokenFactory", contractData, constructorArgs);
    upsertVerificationManifestEntry(verificationManifest, "PaymentTokenFactory", {
      address: deployedPaymentTokenFactory.address,
      deployBlockNumber: deployedPaymentTokenFactory.deployBlockNumber,
      contractName: "PaymentTokenFactory",
      verificationContract: buildVerificationContractId(contractData, "PaymentTokenFactory"),
      constructorArgs,
    });
    console.log("ERC-20 payment tokens are created later through PaymentTokenFactory.createPaymentToken(...).");
  }

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
