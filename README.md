# AsDescribed

AsDescribed is a GenLayer-native marketplace delivery court. Buyers escrow GEN, sellers provide fulfillment evidence, and independent validators decide whether a disputed delivery matched its listing.

## What is included

- A pinned-runner Python Intelligent Contract for Bradbury (chain `4221`)
- Single-item listings and one escrowed order per listing
- Seller delivery updates and two-sided public URL evidence
- Buyer confirmation happy path
- Binary buyer/seller validator adjudication with defensive error handling
- Public verdict receipts and marketplace statistics
- A polished React/Vite frontend with demo and live Bradbury modes
- Direct-mode contract tests and repository hygiene defaults

## Important Bradbury limitation

The verified Bradbury runtime accepts payable calls but does not expose the outbound transfer API used by newer documentation. The MVP therefore records an authoritative settlement disposition:

- `SELLER_CLAIMABLE`
- `BUYER_REFUND_CLAIMABLE`

Funds are not represented as transferred by the UI. When the verified runtime gains outbound transfers, these ledger states are the narrow integration points for finalized payouts.

## Contract setup

Python 3.12 or newer is required.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\genvm-lint.exe check contracts\as_described.py
$env:ACCOUNT_PRIVATE_KEY = "0x<32-byte-test-key>"
.\.venv\Scripts\python.exe -m pytest tests\direct -q
```

Never use a production key for direct-mode tests.

## Frontend setup

```powershell
npm ci
npm run dev
```

The app starts in demo mode when `VITE_CONTRACT_ADDRESS` is absent. A local, git-ignored `.env` file is already prepared; set the public contract address to enable Bradbury reads and writes.

Wallet connectivity uses RainbowKit 2, Wagmi 2, Viem 2, and TanStack Query. Installed browser wallets work without extra configuration. To enable WalletConnect QR/mobile wallets, create a public project ID in WalletConnect Cloud and set `VITE_WALLETCONNECT_PROJECT_ID`.

`ACCOUNT_PRIVATE_KEY` is reserved for an explicit CLI deployment. Never rename it with a `VITE_` prefix, because Vite exposes all `VITE_*` values to browser code. The frontend does not read that key, import local accounts, or unlock wallets already present on the computer.

## Bradbury deployment

Current testnet deployment:

- Contract: `0x70786c835A0FFB1A7ea6A212dfbf7e59cbA20b99`
- Transaction: `0x11fa7a0b9fe5458cb3034738a512e3b13e2dc9bb8e8fb3c3abe7accedfbf4f16`
- Result: `ACCEPTED`, `FINISHED_WITH_RETURN`, 11 schema methods

The public receipt is stored in `deployments/bradbury.json`. `VITE_CONTRACT_ADDRESS` is updated automatically after a verified deployment.

```powershell
npm run bradbury:status
npm run deploy:bradbury
```

Run the commands above only after intentionally placing a dedicated Bradbury test key in `.env`; do not use a production wallet. The script signs in memory and does not import the account into the GenLayer CLI keystore or touch other wallets. Bradbury requires test GEN. Use the faucet at <https://testnet-faucet.genlayer.foundation/> if that dedicated test account is unfunded. After deployment:

1. Inspect the deployment receipt, including execution output.
2. Verify the contract with `genlayer schema <address>`.
3. Put the deployed address in `VITE_CONTRACT_ADDRESS`.
4. If WalletConnect is enabled, add the frontend origin to the project allowlist in WalletConnect Cloud.

## Vercel deployment without GitHub

The frontend is a pure Vite build and can be deployed directly from the project folder:

Current production deployment: <https://asdescribed.vercel.app>

```powershell
npm ci
npm run build
npx vercel@latest --prod
```

Set `VITE_CONTRACT_ADDRESS` as a public Vercel build variable. Add `VITE_WALLETCONNECT_PROJECT_ID` only when WalletConnect QR/mobile support is required. Never upload `ACCOUNT_PRIVATE_KEY`, `TEST_BUYER_PRIVATE_KEY`, or the local `.env` file.

The repository includes `vercel.json` with the Vite build settings and security/cache headers.

## Move to another PC and publish to GitHub

The portable ZIP intentionally excludes `.env`, private keys, `node_modules`, build output, Vercel metadata, and Git history.

On the other PC:

```powershell
Copy-Item .env.example .env
npm ci
npm run typecheck
npm run build
npm run dev
```

Fill only the required public frontend values in `.env`. Keep deployment/test private keys local and use dedicated test accounts only.

To create a new GitHub repository from the extracted folder:

```powershell
git init
git add .
git commit -m "Initial AsDescribed MVP Pro"
git branch -M main
git remote add origin https://github.com/<account>/<repository>.git
git push -u origin main
```

The included `.gitignore` prevents local secrets, dependencies, build output, release ZIPs, and Vercel metadata from being committed.
