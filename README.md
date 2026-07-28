# Stone & Scales

Multi-party milestone escrow with on-chain arbitration on
[GenLayer](https://genlayer.com). A buyer funds a deal, milestone tranches are
resolved by approval or dispute, and the authorized recipient pulls the
awarded GEN from escrow.

## Reviewer fix

The settlement path now provides:

- explicit seller payout, buyer refund, dispute-bond, released, refunded,
  unallocated, and remaining-escrow accounting;
- winner-authorized `claim_seller_payout`, `claim_buyer_refund`, and
  `claim_dispute_bond` pull payments that queue real GEN transfers;
- checks-effects-interactions in every claim: validate caller and phase, read
  the award, zero the claimable amount, update accounting, then emit the
  transfer;
- single-use claims and recipient checks;
- verdict and milestone settlement that allocate funds to claimable balances
  instead of treating a status change as payment;
- evidence-fetch failure fallback during arbitration; and
- deterministic `recover_timed_out_dispute` after seven days. Recovery never
  fetches the party-supplied evidence URL, refunds the disputed tranche to the
  buyer, and returns the bond to its depositor.

The contract also rejects cross-deal dispute IDs and will not mark a deal
`CLOSED` while unallocated escrow remains.

## How it works

1. The buyer calls `open_deal` with exactly the declared total in GEN.
2. The seller accepts and declares milestone shares in basis points.
3. The seller requests release; the buyer approves a completed tranche.
4. Approval allocates that tranche to `seller_claimable`.
5. Either party can instead open a bonded dispute.
6. Arbiters file findings and `finalize_dispute` allocates the verdict split to
   seller and buyer claimable balances. An unavailable evidence URL is recorded
   and arbitration continues with the on-chain findings.
7. The winner claims with the role-gated pull-payment method.
8. If arbitration stalls, either counterparty can recover after seven days
   without any web request.

## Escrow accounting

For each deal:

```text
allocated = released + refunded + seller_claimable + buyer_claimable
remaining_escrow_balance = funded - released - refunded
unallocated_escrow = funded - allocated
```

`released` and `refunded` count GEN that has actually been claimed. Claimable
balances are resolved awards still held by the contract. Dispute bonds are
separate liabilities and expose both `bond_total` and `bond_claimable`.

## Repository layout

```text
backend/escrow-judge.py              GenLayer intelligent contract
frontend/                            React + Vite + TypeScript dApp
tests/direct/                        Fast direct-mode contract tests
tests/integration/                   GLSim value-transfer smoke test
backend/deployment.json              Existing Bradbury deployment metadata
requirements-dev.txt                 Pinned lint/test tooling
```

## Run locally

Backend tooling:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

PowerShell activation:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Copy `frontend/.env.example` to `frontend/.env.local` only when overriding the
public testnet defaults. Never put a private key in a Vite environment file.

## Environment variables

| Name | Required | Description |
| --- | --- | --- |
| `VITE_CONTRACT_ADDRESS` | yes | EscrowArbiter address for the selected network |
| `VITE_CHAIN_ID` | yes | GenLayer chain ID; Bradbury is `4221` |
| `VITE_RPC_URL` | yes | GenLayer JSON-RPC endpoint |
| `VITE_WC_PROJECT_ID` | no | WalletConnect project ID; injected wallets do not need it |

## Test and build

The contract pins the concrete
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`
runner. With `genvm-linter==0.11.0`, select the cached compatible GenVM bundle:

```bash
GENVM_VERSION=v0.3.0-rc7 genvm-lint check backend/escrow-judge.py
pytest tests/direct -v
cd frontend && npm run build
```

PowerShell:

```powershell
$env:PYTHONUTF8 = "1"
$env:GENVM_VERSION = "v0.3.0-rc7"
genvm-lint check backend\escrow-judge.py
pytest tests\direct -v
Set-Location frontend
npm run build
```

The direct suite covers exact funding, seller and buyer verdict claims,
unauthorized callers, double claims, failed evidence, early and mature timeout
recovery, bond claims, and unallocated-escrow recovery.

The optional GLSim transfer smoke test is:

```bash
gltest tests/integration -v -s --network localnet
```

GLSim 0.29.2 cannot run that deployment test on Windows because of its fd0
temporary-file locking behavior; run it on Linux or WSL. The direct suite still
runs on Windows.

## Deploy

Use a burner/testnet wallet only:

```bash
npx genlayer deploy --contract backend/escrow-judge.py
```

After finalization:

1. record the network, contract address, deployment transaction, and
   finalization transaction in `backend/deployment.json`;
2. update `frontend/.env.example`;
3. run the frontend build again; and
4. never commit the wallet key, seed phrase, `.env`, or `.env.local`.

### Existing deployment

The repository arrived with this finalized baseline deployment:

- Network: GenLayer Bradbury Testnet, chain ID `4221`
- Contract: `0x9f5f20c298415d3fd653867ab1b27a10184358b9`
- Deployment transaction:
  `0xee6b87b6b46662b58e03c4909fb10e2784a737a7c40838f7f934aa40adb6dbf7`
- Finalization transaction:
  `0x55c5548c990eadce914d1d196f292528c178f05a982d71cf97779978e6796329`
- Recorded execution: `FINISHED_WITH_RETURN`

This working tree's additional accounting and cross-deal hardening was **not**
redeployed during this change. Deploy it to a new testnet address before
treating the updated source and UI as the production pair.

## Contract methods

| Method | Type | Description |
| --- | --- | --- |
| `open_deal` | payable | Opens a deal and requires exact escrow funding. |
| `accept_deal` | write | Seller accepts a funded deal. |
| `add_witness` | write | Registers the optional witness. |
| `declare_milestone` | write | Declares a milestone and escrow share. |
| `attest_milestone` | write | Records a witness attestation. |
| `request_release` | write | Seller requests milestone release. |
| `release_milestone` | write | Buyer allocates an approved tranche to the seller. |
| `open_dispute` | payable | Opens a bonded milestone dispute. |
| `assign_arbiter` | write | Platform assigns an arbiter. |
| `file_arbiter_finding` | write | Assigned arbiter records a finding. |
| `finalize_dispute` | write | Allocates the verdict split to claimable balances. |
| `recover_timed_out_dispute` | write | After seven days, refunds without fetching evidence. |
| `claim_seller_payout` | write | Seller-only pull payment for awarded GEN. |
| `claim_buyer_refund` | write | Buyer-only pull payment for refundable GEN. |
| `claim_dispute_bond` | write | Recipient-only pull payment for the resolved bond. |
| `void_deal` | write | Platform allocates unallocated escrow back to the buyer. |
| `deal` | view | Returns deal and escrow accounting. |
| `milestones_of` | view | Returns declared milestones. |
| `role_of` | view | Returns an address's deal role. |
| `participants` | view | Returns deal participants. |
| `dispute` | view | Returns verdict, evidence-failure, and bond accounting. |
| `tranche_state` | view | Returns tranche and award details. |
| `platform_summary` | view | Returns aggregate deal/dispute counts. |

## Clean release package

The final ZIP must exclude `.git`, `.env*`, `.venv`, `node_modules`, `dist`,
`artifacts`, caches, logs, keys, and other secrets. Those paths are ignored by
Git and are also excluded from the packaged deliverable produced for this fix.

## Known limitation

Bradbury RPC/explorer indexing can lag transaction acceptance or finalization.
If a claim is accepted but the UI still shows the old balance, wait for
finalization and refresh before retrying; the contract's zeroed claimable state
prevents a successful double claim.

## License

MIT
