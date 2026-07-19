"""Windows compatibility for genlayer-test's temporary stdin injection."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path


_TEMP_STDIN_FILES: list[str] = []


if os.name == "nt":
    from gltest.direct import loader

    def _inject_message_to_fd0_windows(vm) -> None:
        from genlayer.py import calldata
        from genlayer.py.types import Address

        sender_addr = Address(vm.sender) if isinstance(vm.sender, bytes) else vm.sender
        contract_addr = (
            Address(vm._contract_address)
            if isinstance(vm._contract_address, bytes)
            else vm._contract_address
        )
        origin_addr = Address(vm.origin) if isinstance(vm.origin, bytes) else vm.origin
        encoded = calldata.encode(
            {
                "contract_address": contract_addr,
                "sender_address": sender_addr,
                "origin_address": origin_addr,
                "stack": [],
                "value": vm._value,
                "datetime": vm._datetime,
                "is_init": False,
                "chain_id": vm._chain_id,
                "entry_kind": 0,
                "entry_data": b"",
                "entry_stage_data": None,
            }
        )

        fd, path = tempfile.mkstemp(prefix="asdescribed-gltest-")
        os.write(fd, encoded)
        os.lseek(fd, 0, os.SEEK_SET)
        vm._original_stdin_fd = os.dup(0)
        os.dup2(fd, 0)
        os.close(fd)
        _TEMP_STDIN_FILES.append(path)

    loader._inject_message_to_fd0 = _inject_message_to_fd0_windows


def pytest_sessionfinish() -> None:
    for path in _TEMP_STDIN_FILES:
        try:
            Path(path).unlink(missing_ok=True)
        except PermissionError:
            pass

