# AsDescribed architecture

## Consensus boundary

| Layer | Responsibility |
|---|---|
| Frontend | Listing discovery, wallet UX, input validation, transaction tracking, and non-authoritative receipt presentation |
| Intelligent Contract | Listing/order state, payable escrow intake, party authorization, evidence registry, validator comparison, verdict persistence, and settlement disposition |
| External sources | Public tracking pages and evidence documents; always treated as untrusted and independently re-fetched |

## Dispute flow

1. A seller creates a plain-language listing.
2. A buyer purchases with the exact listing price as payable value.
3. The seller records delivery and an optional public tracking URL.
4. The buyer confirms receipt, or opens a dispute with a public evidence URL.
5. Both parties may append a small evidence pack.
6. The leader and validators independently fetch the same capped sources.
7. Each model returns a normalized binary winner.
8. Consensus requires exact agreement on `winner`; prose never moves settlement.
9. The contract stores the verdict and marks the escrow disposition claimable by the winner.

## Evidence safety

- At most three URLs per side are included in adjudication.
- URLs must be public HTTP(S) references.
- Responses over 32 KiB are skipped.
- Decoded text is capped to 6,000 characters.
- Control characters are stripped.
- Common prompt-injection phrases cause the source to be skipped.
- Evidence text is base64-encoded before it is placed in the adjudication prompt.

## Bradbury runtime constraint

The verified runtime primer forbids relying on `emit_transfer` or `emit_event`. The contract therefore settles an on-chain claimable ledger state without claiming that native GEN has left the contract. This is deliberately explicit in the contract, UI, tests, and documentation.

