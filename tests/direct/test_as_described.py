import json


def test_complete_marketplace_lifecycle(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = direct_deploy("contracts/as_described.py")
    price = 2_500_000_000_000_000_000

    direct_vm.sender = direct_alice
    listing = contract.create_listing(
        "camera-001",
        "Analog Rangefinder Camera",
        "Working light meter, 40 mm lens, clean glass, and a fresh battery.",
        "https://evidence.example/camera.jpg",
        price,
        "Ships tracked in a padded case.",
        "2026-07-19T10:00:00Z",
    )
    assert listing["status"] == "AVAILABLE"
    assert contract.get_market_state()["listing_count"] == 1

    direct_vm.sender = direct_charlie
    direct_vm.value = price
    order = contract.purchase(
        "camera-001", "order-001", "2026-07-19T10:05:00Z"
    )
    assert order["status"] == "ESCROWED"
    assert order["settlement"] == "LOCKED"
    assert contract.get_listing("camera-001")["status"] == "ESCROWED"

    direct_vm.value = 0
    with direct_vm.expect_revert("only the seller can mark delivered"):
        contract.mark_delivered(
            "order-001",
            "https://evidence.example/tracking",
            "Handed to carrier.",
            "2026-07-19T12:00:00Z",
        )

    direct_vm.sender = direct_alice
    delivered = contract.mark_delivered(
        "order-001",
        "https://evidence.example/tracking",
        "Handed to carrier in the promised padded case.",
        "2026-07-19T12:00:00Z",
    )
    assert delivered["status"] == "DELIVERED"

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only the buyer can open a dispute"):
        contract.open_dispute(
            "order-001",
            "The lens is missing.",
            "https://evidence.example/unbox",
            "Unboxing record.",
            "2026-07-20T09:00:00Z",
        )

    direct_vm.sender = direct_charlie
    disputed = contract.open_dispute(
        "order-001",
        "The promised 40 mm lens is missing from the delivery.",
        "https://evidence.example/unbox",
        "Unboxing inventory and photos.",
        "2026-07-20T09:00:00Z",
    )
    assert disputed["status"] == "DISPUTED"
    assert len(disputed["buyer_evidence"]) == 1

    direct_vm.sender = direct_alice
    contract.add_evidence(
        "order-001",
        "https://evidence.example/packing-slip",
        "Seller packing slip states that the lens was included.",
    )

    direct_vm.mock_web(
        r".*evidence\.example/tracking.*",
        {"status": 200, "body": "Delivered to recipient on July 20."},
    )
    direct_vm.mock_web(
        r".*evidence\.example/unbox.*",
        {
            "status": 200,
            "body": "Unboxing inventory: camera body, battery, case. No lens present.",
        },
    )
    direct_vm.mock_web(
        r".*evidence\.example/packing-slip.*",
        {"status": 200, "body": "Packing slip: camera, 40 mm lens, battery, case."},
    )
    direct_vm.mock_llm(
        r".*independent commerce adjudicator.*",
        json.dumps(
            {
                "winner": "buyer",
                "summary": "Delivery omitted a material promised component.",
                "reasons": "The listing promised a 40 mm lens and the buyer's unboxing inventory shows it absent.",
            }
        ),
    )

    direct_vm.sender = direct_charlie
    resolved = contract.adjudicate("order-001", "2026-07-20T10:00:00Z")
    assert resolved["status"] == "RESOLVED"
    assert resolved["winner"] == "buyer"
    assert resolved["settlement"] == "BUYER_REFUND_CLAIMABLE"
    assert contract.get_listing("camera-001")["status"] == "CLOSED"

    state = contract.get_market_state()
    assert state["order_count"] == 1
    assert state["disputed_count"] == 1
    assert state["resolved_count"] == 1


def test_happy_path_confirmation(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/as_described.py")
    price = 750_000_000_000_000_000

    direct_vm.sender = direct_alice
    contract.create_listing(
        "happy-001",
        "Verified Mechanical Keyboard",
        "Factory switches, cable, keycap puller, and working RGB controller.",
        "https://evidence.example/keyboard",
        price,
        "Ships tracked with the original foam packaging.",
        "2026-07-19T11:00:00Z",
    )

    direct_vm.sender = direct_bob
    direct_vm.value = price
    purchased = contract.purchase(
        "happy-001", "happy-order-001", "2026-07-19T11:05:00Z"
    )
    assert purchased["status"] == "ESCROWED"

    direct_vm.sender = direct_alice
    direct_vm.value = 0
    delivered = contract.mark_delivered(
        "happy-order-001",
        "https://evidence.example/happy-tracking",
        "Keyboard and every listed accessory handed to the carrier.",
        "2026-07-19T13:00:00Z",
    )
    assert delivered["status"] == "DELIVERED"

    direct_vm.sender = direct_bob
    resolved = contract.confirm_receipt(
        "happy-order-001", "2026-07-20T09:00:00Z"
    )
    assert resolved["status"] == "RESOLVED"
    assert resolved["winner"] == "seller"
    assert resolved["settlement"] == "SELLER_CLAIMABLE"
    assert contract.get_listing("happy-001")["status"] == "CLOSED"

    state = contract.get_market_state()
    assert state["order_count"] == 1
    assert state["resolved_count"] == 1
    assert state["disputed_count"] == 0


def test_purchase_guards(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/as_described.py")
    price = 500_000_000_000_000_000

    direct_vm.sender = direct_alice
    contract.create_listing(
        "guard-001",
        "Guard Test Listing",
        "A listing used to verify buyer and value protections.",
        "",
        price,
        "",
        "2026-07-19T12:00:00Z",
    )

    direct_vm.value = price
    with direct_vm.expect_revert("seller cannot buy their own listing"):
        contract.purchase(
            "guard-001", "guard-order-self", "2026-07-19T12:01:00Z"
        )

    direct_vm.sender = direct_bob
    direct_vm.value = price - 1
    with direct_vm.expect_revert("sent value must equal listing price"):
        contract.purchase(
            "guard-001", "guard-order-low", "2026-07-19T12:02:00Z"
        )

    direct_vm.value = price
    contract.purchase(
        "guard-001", "guard-order-valid", "2026-07-19T12:03:00Z"
    )
    with direct_vm.expect_revert("listing is not available"):
        contract.purchase(
            "guard-001", "guard-order-second", "2026-07-19T12:04:00Z"
        )
