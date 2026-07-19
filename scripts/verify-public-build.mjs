import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const envContents = fs.readFileSync(path.join(projectRoot, ".env"), "utf8");
const distPath = path.join(projectRoot, "dist");

function envValue(key) {
  const match = envContents.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) return "";

  const value = match[1].trim();
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  return quoted ? value.slice(1, -1) : value;
}

function readBundle(directory) {
  let contents = "";

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    contents += entry.isDirectory()
      ? readBundle(entryPath)
      : fs.readFileSync(entryPath, "utf8");
  }

  return contents;
}

const privateKeys = [
  ["ACCOUNT_PRIVATE_KEY", envValue("ACCOUNT_PRIVATE_KEY")],
  ["TEST_BUYER_PRIVATE_KEY", envValue("TEST_BUYER_PRIVATE_KEY")],
];
const contractAddress = envValue("VITE_CONTRACT_ADDRESS");
const bundle = readBundle(distPath);
const leakedPrivateKeys = privateKeys
  .filter(([, value]) => Boolean(value && bundle.includes(value)))
  .map(([key]) => key);
const publicAddressIncluded = Boolean(
  contractAddress &&
    bundle.toLowerCase().includes(contractAddress.toLowerCase()),
);

console.log(
  `PRIVATE_KEYS_IN_DIST=${leakedPrivateKeys.length ? leakedPrivateKeys.join(",") : "NO"}`,
);
console.log(
  `CONTRACT_ADDRESS_IN_DIST=${publicAddressIncluded ? "YES" : "NO"}`,
);
console.log(
  `VITE_WALLETCONNECT_PROJECT_ID=${envValue("VITE_WALLETCONNECT_PROJECT_ID") ? "SET" : "EMPTY"}`,
);

if (leakedPrivateKeys.length || !publicAddressIncluded) {
  process.exitCode = 1;
}
