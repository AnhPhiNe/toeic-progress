"""Transport-only ledger double. SQL semantics are covered independently in PGlite."""

class ExplanationLedgerMock:
    def __init__(self):
        self.questions = {}

    def respond(self, name, body):
        if name == "explanation_ledger_ready":
            return {"version": 1, "tables": True}
        key = (body["p_owner_id"], body["p_ticket_id"], body["p_question_number"])
        if name == "claim_explanation_question":
            entry = self.questions.setdefault(key, {"binding": body["p_binding"], "attempts": 0, "result": None,
                                                   "requests": {}, "lease": None})
            if entry["binding"] != body["p_binding"]:
                return {"action": "content_changed"}
            remaining = 3 - entry["attempts"]
            if entry["result"] is not None:
                return {"action": "completed", "draft": entry["result"], "remainingAttempts": remaining}
            request = body["p_request_id"]
            if request in entry["requests"]:
                return {"action": "pending" if entry["requests"][request] == "running" else "replayed",
                        "remainingAttempts": remaining}
            if entry["lease"]:
                entry["requests"][request] = "running"
                return {"action": "pending", "remainingAttempts": remaining}
            if not remaining:
                return {"action": "exhausted", "remainingAttempts": 0}
            entry["attempts"] += 1
            entry["lease"] = body["p_lease_id"]
            entry["requests"][request] = "running"
            return {"action": "claimed", "remainingAttempts": remaining - 1}
        entry = self.questions[key]
        if entry["lease"] != body["p_lease_id"]:
            return {"accepted": False}
        entry["lease"] = None
        entry["result"] = body["p_result"]
        status = "completed" if entry["result"] is not None else "failed"
        entry["requests"] = {request: status if state == "running" else state for request, state in entry["requests"].items()}
        return {"accepted": True, "remainingAttempts": 3 - entry["attempts"]}

    async def rpc(self, name, body):
        return self.respond(name, body)
