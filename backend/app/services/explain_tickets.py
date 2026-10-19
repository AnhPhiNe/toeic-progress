"""A signed, short-lived permission to explain the questions that one screenshot reading has already paid for.

Reading a screenshot counts one AI use. The explanations for the questions it found are written afterwards, so the
reading can return quickly; the ticket lets that follow-up call through without counting another use. A ticket is
tied to the account, to the exact text read for each question, and to a 24 hour window, and is honoured a few times
only (a first try plus retries when the app was closed mid-way).
"""

import base64
import hashlib
import hmac
import json
import time

TICKET_SECONDS = 24 * 60 * 60
MAX_TICKET_USES = 3


def item_digest(number: int, question: str, options: list[str], context: str) -> str:
    """Fingerprint of a question as it was read, so a ticket cannot explain other text."""
    value = json.dumps([number, question, options, context], ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(value.encode()).hexdigest()[:32]


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def issue(secret: str, owner: str, ticket_id: str, digests: dict[int, str], now: float | None = None) -> str:
    payload = {"o": owner, "i": ticket_id, "e": int((now or time.time()) + TICKET_SECONDS), "d": {str(number): digest for number, digest in digests.items()}}
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
    if not isinstance(payload.get("e"), int) or payload["e"] < (now or time.time()):
        return None
    return payload


class TicketUses:
    """Counts uses per ticket in this process. Expired tickets are forgotten; their tokens no longer verify anyway."""

    def __init__(self):
        self.uses: dict[str, tuple[int, int]] = {}

    def consume(self, ticket_id: str, expires: int, now: float | None = None) -> bool:
        moment = now or time.time()
        self.uses = {key: value for key, value in self.uses.items() if value[1] >= moment}
        count, _ = self.uses.get(ticket_id, (0, expires))
        if count >= MAX_TICKET_USES:
            return False
        self.uses[ticket_id] = (count + 1, expires)
        return True
