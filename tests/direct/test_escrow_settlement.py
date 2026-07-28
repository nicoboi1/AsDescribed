import json


CONTRACT = "backend/escrow-judge.py"
MILESTONES_URL = "https://evidence.example/milestones.json"
EVIDENCE_URL = "https://evidence.example/evidence.json"
TOTAL = 1_000
BOND = 25


def as_address(value):
    # direct_deploy installs the contract runner modules for the active test,
    # so Address must be imported after deployment rather than at collection.
    from genlayer.py.types import Address

    return Address(value)


def deploy_contract(direct_vm, direct_deploy, platform):
    direct_vm.sender = platform
    contract = direct_deploy(CONTRACT)
    direct_vm.mock_web(
        r".*evidence\.example/milestones\.json",
        {"status": 200, "body": '{"milestones":[{"idx":0}]}'},
    )
    return contract


def deploy_deal(
    direct_vm,
    direct_deploy,
    buyer,
    seller,
    platform,
    share_bps=10_000,
):
    contract = deploy_contract(direct_vm, direct_deploy, platform)
    direct_vm.sender = buyer
    direct_vm.value = TOTAL
    deal_id = contract.open_deal(
        as_address(seller),
        MILESTONES_URL,
        TOTAL,
        False,
    )
    direct_vm.value = 0
    direct_vm.sender = seller
    contract.accept_deal(deal_id)
    contract.declare_milestone(
        deal_id,
        0,
        "Deliver the audited package",
        share_bps,
    )
    return contract, deal_id


def open_dispute(direct_vm, contract, deal_id, opener):
    direct_vm.mock_llm(
        r".*Normalize a free-text dispute statement.*",
        json.dumps(
            {"summary": "The submitted package does not satisfy the milestone."}
        ),
    )
    direct_vm.sender = opener
    direct_vm.value = BOND
    dispute_id = contract.open_dispute(
        deal_id,
        0,
        "The submitted package is incomplete.",
        EVIDENCE_URL,
    )
    direct_vm.value = 0
    return dispute_id


def add_finding(
    direct_vm,
    contract,
    deal_id,
    dispute_id,
    platform,
    arbiter,
    lean,
):
    direct_vm.sender = platform
    contract.assign_arbiter(deal_id, as_address(arbiter))
    direct_vm.sender = arbiter
    contract.file_arbiter_finding(
        deal_id,
        dispute_id,
        lean,
        f"The evidence supports {lean}.",
    )


def finalize(
    direct_vm,
    contract,
    deal_id,
    dispute_id,
    verdict,
    split_bps,
    evidence_status=200,
):
    direct_vm.mock_web(
        r".*evidence\.example/evidence\.json",
        {
            "status": evidence_status,
            "body": (
                '{"delivery":"incomplete"}'
                if evidence_status < 400
                else "temporarily unavailable"
            ),
        },
    )
    direct_vm.mock_llm(
        r".*synthesize a final verdict for an escrow dispute.*",
        json.dumps(
            {
                "verdict": verdict,
                "split_bps": split_bps,
                "reasoning": f"The record supports {verdict}.",
            }
        ),
    )
    return contract.finalize_dispute(deal_id, dispute_id)


def prepare_verdict(
    direct_vm,
    direct_deploy,
    buyer,
    seller,
    arbiter,
    platform,
    verdict,
    split_bps,
    evidence_status=200,
):
    contract, deal_id = deploy_deal(
        direct_vm,
        direct_deploy,
        buyer,
        seller,
        platform,
    )
    dispute_id = open_dispute(direct_vm, contract, deal_id, buyer)
    add_finding(
        direct_vm,
        contract,
        deal_id,
        dispute_id,
        platform,
        arbiter,
        verdict,
    )
    assert (
        finalize(
            direct_vm,
            contract,
            deal_id,
            dispute_id,
            verdict,
            split_bps,
            evidence_status,
        )
        == verdict
    )
    return contract, deal_id, dispute_id


def test_exact_funding_creates_explicit_escrow_balance(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_owner,
):
    contract = deploy_contract(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_alice
    direct_vm.value = TOTAL
    deal_id = contract.open_deal(
        as_address(direct_bob),
        MILESTONES_URL,
        TOTAL,
        False,
    )
    direct_vm.value = 0

    state = contract.deal(deal_id)
    assert state["funded"] == TOTAL
    assert state["allocated"] == 0
    assert state["released"] == 0
    assert state["refunded"] == 0
    assert state["seller_claimable"] == 0
    assert state["buyer_claimable"] == 0
    assert state["escrow_balance"] == TOTAL
    assert state["remaining_escrow_balance"] == TOTAL
    assert state["unallocated_escrow"] == TOTAL


def test_open_deal_rejects_inexact_funding(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_owner,
):
    contract = deploy_contract(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_alice
    for supplied in (TOTAL - 1, TOTAL + 1):
        direct_vm.value = supplied
        with direct_vm.expect_revert("must equal total"):
            contract.open_deal(
                as_address(direct_bob),
                MILESTONES_URL,
                TOTAL,
                False,
            )


def test_seller_winner_claims_payout_and_accounting_updates(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_charlie,
    direct_owner,
):
    contract, deal_id, _ = prepare_verdict(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        direct_charlie,
        direct_owner,
        "SELLER_WINS",
        0,
    )
    prepared = contract.deal(deal_id)
    assert prepared["allocated"] == TOTAL
    assert prepared["seller_claimable"] == TOTAL
    assert prepared["buyer_claimable"] == 0
    assert prepared["released"] == 0

    direct_vm.sender = direct_bob
    assert contract.claim_seller_payout(deal_id) == TOTAL
    claimed = contract.deal(deal_id)
    assert claimed["seller_claimable"] == 0
    assert claimed["released"] == TOTAL
    assert claimed["refunded"] == 0
    assert claimed["remaining_escrow_balance"] == 0


def test_buyer_winner_claims_refund_and_accounting_updates(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_charlie,
    direct_owner,
):
    contract, deal_id, _ = prepare_verdict(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        direct_charlie,
        direct_owner,
        "BUYER_WINS",
        10_000,
    )
    prepared = contract.deal(deal_id)
    assert prepared["buyer_claimable"] == TOTAL
    assert prepared["seller_claimable"] == 0
    assert prepared["refunded"] == 0

    direct_vm.sender = direct_alice
    assert contract.claim_buyer_refund(deal_id) == TOTAL
    claimed = contract.deal(deal_id)
    assert claimed["buyer_claimable"] == 0
    assert claimed["released"] == 0
    assert claimed["refunded"] == TOTAL
    assert claimed["remaining_escrow_balance"] == 0


def test_unauthorized_address_cannot_claim_payout_or_refund(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_charlie,
    direct_owner,
):
    contract, deal_id, _ = prepare_verdict(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        direct_charlie,
        direct_owner,
        "SPLIT",
        5_000,
    )
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("permitted ['SELLER']"):
        contract.claim_seller_payout(deal_id)
    with direct_vm.expect_revert("permitted ['BUYER']"):
        contract.claim_buyer_refund(deal_id)


def test_double_payout_and_refund_claims_fail(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_charlie,
    direct_owner,
):
    contract, deal_id, _ = prepare_verdict(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        direct_charlie,
        direct_owner,
        "SPLIT",
        5_000,
    )
    direct_vm.sender = direct_bob
    assert contract.claim_seller_payout(deal_id) == TOTAL // 2
    with direct_vm.expect_revert("no seller payout claimable"):
        contract.claim_seller_payout(deal_id)

    direct_vm.sender = direct_alice
    assert contract.claim_buyer_refund(deal_id) == TOTAL // 2
    with direct_vm.expect_revert("no buyer refund claimable"):
        contract.claim_buyer_refund(deal_id)


def test_unavailable_evidence_does_not_lock_settlement(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_charlie,
    direct_owner,
):
    contract, deal_id, dispute_id = prepare_verdict(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        direct_charlie,
        direct_owner,
        "BUYER_WINS",
        5_000,
        evidence_status=503,
    )
    dispute = contract.dispute(dispute_id)
    state = contract.deal(deal_id)
    assert dispute["evidence_failed"] is True
    assert state["buyer_claimable"] == TOTAL

    direct_vm.sender = direct_alice
    assert contract.claim_buyer_refund(deal_id) == TOTAL
    assert contract.deal(deal_id)["remaining_escrow_balance"] == 0


def test_timeout_recovery_is_blocked_before_deadline(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_owner,
):
    direct_vm.warp("2026-07-01T00:00:00Z")
    contract, deal_id = deploy_deal(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        direct_owner,
    )
    dispute_id = open_dispute(direct_vm, contract, deal_id, direct_alice)
    with direct_vm.expect_revert("recovery not available before"):
        contract.recover_timed_out_dispute(deal_id, dispute_id)


def test_timeout_recovery_works_without_fetching_evidence(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_owner,
):
    direct_vm.warp("2026-07-01T00:00:00Z")
    contract, deal_id = deploy_deal(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        direct_owner,
    )
    dispute_id = open_dispute(direct_vm, contract, deal_id, direct_alice)
    direct_vm.warp("2026-07-08T00:00:01Z")

    # No evidence web mock is installed: recovery is fully deterministic and
    # must never touch the party-supplied URL.
    direct_vm.sender = direct_bob
    assert contract.recover_timed_out_dispute(deal_id, dispute_id) == TOTAL
    state = contract.deal(deal_id)
    dispute = contract.dispute(dispute_id)
    assert state["buyer_claimable"] == TOTAL
    assert dispute["final_verdict"] == "RECOVERY_REFUND"
    assert dispute["recovered"] is True

    direct_vm.sender = direct_alice
    assert contract.claim_buyer_refund(deal_id) == TOTAL
    assert contract.deal(deal_id)["refunded"] == TOTAL


def test_dispute_bond_claim_is_explicit_authorized_and_single_use(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_charlie,
    direct_owner,
):
    contract, _, dispute_id = prepare_verdict(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        direct_charlie,
        direct_owner,
        "SELLER_WINS",
        10_000,
    )
    before = contract.dispute(dispute_id)
    assert before["bond_total"] == BOND
    assert before["bond_claimable"] == BOND
    assert before["bond_claimed"] is False

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("only bond recipient may claim"):
        contract.claim_dispute_bond(dispute_id)

    direct_vm.sender = direct_bob
    assert contract.claim_dispute_bond(dispute_id) == BOND
    after = contract.dispute(dispute_id)
    assert after["bond_total"] == BOND
    assert after["bond_claimable"] == 0
    assert after["bond_claimed"] is True
    with direct_vm.expect_revert("bond already claimed"):
        contract.claim_dispute_bond(dispute_id)


def test_partial_milestones_do_not_close_with_unallocated_escrow(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_owner,
):
    contract, deal_id = deploy_deal(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        direct_owner,
        share_bps=5_000,
    )
    direct_vm.sender = direct_bob
    contract.request_release(deal_id, 0)
    direct_vm.sender = direct_alice
    assert contract.release_milestone(deal_id, 0) == TOTAL // 2

    state = contract.deal(deal_id)
    assert state["phase"] == "IN_PROGRESS"
    assert state["seller_claimable"] == TOTAL // 2
    assert state["unallocated_escrow"] == TOTAL // 2

    direct_vm.sender = direct_owner
    assert contract.void_deal(deal_id, "No further milestones") == TOTAL // 2
    recovered = contract.deal(deal_id)
    assert recovered["phase"] == "VOID"
    assert recovered["buyer_claimable"] == TOTAL // 2
