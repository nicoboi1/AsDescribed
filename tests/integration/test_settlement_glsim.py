"""GLSim integration smoke test for real value-transfer settlement."""

import hashlib
import json
import os
from urllib.request import Request, urlopen

import pytest
from gltest import get_contract_factory
from gltest.accounts import create_accounts
from gltest.assertions import tx_execution_succeeded


RPC_URL = "http://127.0.0.1:4000/api"
TOTAL = 1_000_000


def rpc(method: str, params):
    body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    ).encode()
    request = Request(RPC_URL, data=body, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=10) as response:
        payload = json.loads(response.read().decode())
    assert "error" not in payload, payload
    return payload["result"]


@pytest.mark.skipif(
    os.name == "nt",
    reason="GLSim 0.29.2 cannot deploy contracts on Windows because its fd0 temp file remains locked",
)
def test_seller_claim_transfers_gen_and_updates_accounting():
    buyer, seller = create_accounts(2)
    rpc("sim_fundAccount", [buyer.address, TOTAL * 10])
    rpc("sim_fundAccount", [seller.address, TOTAL])
    seller_before = int(rpc("sim_getBalance", {"account_address": seller.address}))

    factory = get_contract_factory(contract_file_path="escrow-judge.py")
    buyer_contract = factory.deploy(account=buyer)
    seller_contract = factory.build_contract(buyer_contract.address, account=seller)

    receipt = buyer_contract.open_deal(
        args=[seller.address, "https://example.com/", TOTAL, False]
    ).transact(value=TOTAL)
    assert tx_execution_succeeded(receipt)

    deal_id = hashlib.sha256(
        f"deal|1|{buyer.address.lower()}".encode("utf-8")
    ).hexdigest()
    assert tx_execution_succeeded(seller_contract.accept_deal(args=[deal_id]).transact())
    assert tx_execution_succeeded(
        seller_contract.declare_milestone(
            args=[deal_id, 0, "Deliver the complete package", 10_000]
        ).transact()
    )
    assert tx_execution_succeeded(
        seller_contract.request_release(args=[deal_id, 0]).transact()
    )
    assert tx_execution_succeeded(
        buyer_contract.release_milestone(args=[deal_id, 0]).transact()
    )

    prepared = buyer_contract.deal(args=[deal_id]).call()
    assert int(prepared["released"]) == 0
    assert int(prepared["seller_claimable"]) == TOTAL

    claim = seller_contract.claim_seller_payout(args=[deal_id]).transact(
        wait_triggered_transactions=True
    )
    assert tx_execution_succeeded(claim)
    settled = buyer_contract.deal(args=[deal_id]).call()
    assert int(settled["released"]) == TOTAL
    assert int(settled["seller_claimable"]) == 0
    assert int(settled["escrow_balance"]) == 0
    assert int(rpc("sim_getBalance", {"account_address": seller.address})) == (
        seller_before + TOTAL
    )
