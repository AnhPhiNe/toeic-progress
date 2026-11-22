"""Transport-only double of public.reserve_ai_batch_request. The SQL itself is covered in PGlite (tests/database/test-ai-batches.mjs)."""


class BatchReservationMock:
    def __init__(self, user_limit=27):
        self.user_limit = user_limit
        self.batches = {}
        self.batch_explain_questions = {}
        self.account_used = {}
        self.global_used = 0
        self.requests = set()

    def respond(self, body):
        owner, request, batch = body["p_user_id"], body["p_request_id"], body["p_batch_id"]
        if (owner, request) in self.requests:
            return {"allowed": False, "code": "duplicate"}
        chunks = self.batches.get((owner, batch), 0)
        if chunks >= body["p_max_chunks"]:
            return {"allowed": False, "code": "batch_full"}
        self.requests.add((owner, request))
        self.batches[(owner, batch)] = chunks + 1
        self.global_used += 1  # every request counts against the shared safety caps
        if not chunks:
            self.account_used[owner] = self.account_used.get(owner, 0) + 1
        return {"allowed": True, "remaining": self.user_limit - self.account_used[owner], "limit": self.user_limit}

    def reserve_explain(self, body):
        owner, batch = body["p_user_id"], body["p_batch_id"]
        count, limit = int(body["p_count"]), int(body["p_max_questions"])
        used = self.batch_explain_questions.get((owner, batch), 0)
        granted = max(0, min(count, limit - used))
        self.batch_explain_questions[(owner, batch)] = used + granted
        return {"granted": granted, "used": used + granted, "limit": limit}
