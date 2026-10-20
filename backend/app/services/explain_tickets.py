"""A signed, short-lived permission to explain the questions that one screenshot reading has already paid for.

Reading a screenshot counts one AI use. The explanations for the questions it found are written afterwards, so the
reading can return quickly; the ticket lets that follow-up call through without counting another use. A ticket is
tied to the account, to the exact text read for each question, and to a 24 hour window. Each question gets a first
attempt plus two retries; successful results and duplicate request IDs are replayed without another generation.
"""

import asyncio
import base64
import hashlib
import hmac
import json
import math
import time
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException

TICKET_SECONDS = 24 * 60 * 60
MAX_TICKET_USES = 3  # Per question: first attempt plus two retries.


def item_digest(number: int, question: str, options: list[str], context: str) -> str:
    """Fingerprint of a question as it was read, so a ticket cannot explain other text."""
    value = json.dumps([number, question, options, context], ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(value.encode()).hexdigest()[:32]


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def issue(secret: str, owner: str, ticket_id: str, digests: dict[int, str], now: float | None = None) -> str:
    # Retain sub-second precision so tickets issued immediately after a data
    # reset are distinguishable from pre-reset tickets within that same second.
    payload = {"o": owner, "i": ticket_id, "e": (time.time() if now is None else now) + TICKET_SECONDS,
               "d": {str(number): digest for number, digest in digests.items()}}
    body = _encode(json.dumps(payload, separators=(",", ":")).encode())
    return body + "." + _encode(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())


def verify(secret: str, token: str, owner: str, now: float | None = None) -> dict | None:
    """The ticket's payload when it is genuine, unexpired and issued to this account; otherwise None."""
    try:
        body, signature = token.split(".")
        expected = _encode(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        payload = json.loads(_decode(body))
    except (ValueError, TypeError):
        return None
    if not isinstance(payload, dict) or payload.get("o") != owner or not isinstance(payload.get("d"), dict):
        return None
    if (not isinstance(payload.get("i"), str) or not isinstance(payload.get("e"), (int, float))
            or isinstance(payload["e"], bool) or not math.isfinite(payload["e"])):
        return None
    if payload["e"] < (time.time() if now is None else now):
        return None
    return payload


class TicketUses:
    """Durable service-role RPC claims and single-flight work across workers.

    No in-memory fallback: a missing migration or database outage must never
    dispatch an unreserved paid generation. SQL owns attempts, leases and cache.
    """

    def __init__(self, rpc):
        self.rpc = rpc
        self.running: set[asyncio.Task] = set()

    async def run(self, owner: str, ticket_id: str, number: int, expires: int | float, request_id: str, binding: str,
                  generate: Callable[[], Awaitable[dict | None]]) -> dict:
        task = asyncio.create_task(self._run(owner, ticket_id, number, expires, request_id, binding, generate))
        self.running.add(task)
        task.add_done_callback(self.running.discard)
        # Do not cancel a running generation when the HTTP client disconnects.
        return await asyncio.shield(task)

    async def _run(self, owner, ticket_id, number, expires, request_id, binding, generate):
        lease = str(uuid4())
        parameters = {"p_owner_id": owner, "p_ticket_id": ticket_id, "p_question_number": number}
        claim = await self.rpc("claim_explanation_question", {
            **parameters, "p_binding": binding,
            "p_expires_at": datetime.fromtimestamp(expires, timezone.utc).isoformat(),
            "p_request_id": request_id, "p_lease_id": lease,
        })
        if not isinstance(claim, dict) or claim.get("action") not in {
            "claimed", "completed", "pending", "replayed", "exhausted", "content_changed", "invalidated"
        }:
            raise HTTPException(503, "Chưa kiểm tra được lượt viết lời giải. Chưa gửi yêu cầu tới OpenAI; hãy thử lại.")
        if claim["action"] == "content_changed":
            raise HTTPException(403, "Nội dung hoặc lựa chọn đã thay đổi từ lần viết lời giải đầu. Dùng một lượt phân tích mới.",
                                headers={"X-Error-Code": "EXPLAIN_TICKET_CONTENT_CHANGED"})
        if claim["action"] == "invalidated":
            raise HTTPException(403, "Lượt viết lời giải cũ đã bị hủy sau khi xóa dữ liệu học.",
                                headers={"X-Error-Code": "EXPLAIN_TICKET_INVALID"})
        remaining = claim.get("remainingAttempts")
        if not isinstance(remaining, int) or isinstance(remaining, bool) or not 0 <= remaining <= 3:
            raise HTTPException(503, "Chưa đọc được lượt viết lời giải. Chưa gửi yêu cầu tới OpenAI; hãy thử lại.")
        if claim["action"] == "completed":
            if not isinstance(claim.get("draft"), dict):
                raise HTTPException(503, "Lời giải đã lưu chưa hợp lệ. Vui lòng thử lại sau.")
            return self._outcome(number, remaining, claim["draft"])
        if claim["action"] != "claimed":
            return self._outcome(number, remaining, None, pending=claim["action"] == "pending")
        result = await generate()
        finished = await self.rpc("finish_explanation_question", {**parameters, "p_lease_id": lease, "p_result": result})
        if not isinstance(finished, dict) or finished.get("accepted") is not True:
            # A late worker cannot claim success after its fenced lease expired.
            return self._outcome(number, remaining, None, pending=True)
        return self._outcome(number, remaining, result)

    @staticmethod
    def _outcome(number: int, remaining: int, result: dict | None, *, pending: bool = False) -> dict:
        return {"number": number, "draft": result,
                "status": "completed" if result is not None else "exhausted" if remaining == 0 and not pending else "retryable",
                "remainingAttempts": remaining}
