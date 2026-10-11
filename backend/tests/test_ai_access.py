import json

import pytest
from test_api import USER_ID, extraction, google_identity
from test_api import api as api  # Register the shared pytest fixture.

MANAGED = {"ai_access_managed": True}


@pytest.mark.parametrize("status, message", [("pending", "chờ được duyệt"), ("blocked", "tạm khóa")])
def test_denied_grants_stop_before_images_quota_captcha_and_provider(api, status, message):
    with api(ai_grant={"status": status, "monthly_limit": 30}, settings_overrides=MANAGED) as (client, calls):
        response = client.post("/api/v1/ai/extract", json=extraction())
        assert response.status_code == 403 and message in response.json()["detail"]
        assert not any("reserve_ai" in call[1] or call[0] in ("api.openai.com", "challenges.cloudflare.com") for call in calls)
        usage = client.get("/api/v1/ai/usage").json()
        assert usage["enabled"] is False and usage["accessStatus"] == status and not usage["unlimited"]
        assert not any(call[1].endswith("get_ai_usage") for call in calls)
        assert client.post("/api/v1/sync", json={}).status_code == 200


def test_guest_and_missing_grants_cannot_use_managed_ai(api):
    with api(guest=True, settings_overrides=MANAGED) as (client, calls):
        response = client.post("/api/v1/ai/extract", json=extraction())
        assert response.status_code == 403 and "Đăng nhập Google" in response.json()["detail"]
        assert client.get("/api/v1/ai/usage").json()["accessStatus"] == "login_required"
        assert not any(call[1].endswith("ai_access_grants") or "reserve_ai" in call[1] for call in calls)
    with api(settings_overrides=MANAGED) as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == 403
        assert not any(call[0] == "api.openai.com" for call in calls)


@pytest.mark.parametrize("limit", [1, 27, 10000])
def test_approved_account_uses_its_cap_in_usage_and_reservation(api, limit):
    with api(ai_grant={"status": "active", "monthly_limit": limit}, settings_overrides=MANAGED) as (client, calls):
        assert client.get("/api/v1/ai/usage").json()["enabled"] is True
        usage = next(call for call in calls if call[1].endswith("get_ai_usage"))
        assert usage[2]["p_limit"] == limit
        reply = client.post("/api/v1/ai/extract", json=extraction())
        assert reply.status_code == 200 and reply.json()["usage"]["accessStatus"] == "active"
        reservation = next(call for call in calls if call[1].endswith("reserve_ai_request"))
        assert reservation[2]["p_user_limit"] == limit and reservation[2]["p_day_limit"] == 20
        assert calls.index(reservation) > next(i for i, call in enumerate(calls) if call[1].endswith("ai_access_grants"))
        assert sum(call[0] == "api.openai.com" for call in calls) == 1


def test_custom_quota_error_explains_custom_cap_and_does_not_call_provider(api):
    with api(ai_grant={"status": "active", "monthly_limit": 27}, settings_overrides=MANAGED,
             reservation={"allowed": False, "code": "quota"}, quota_counters={"user:": 27}) as (client, calls):
        response = client.post("/api/v1/ai/extract", json=extraction())
        assert response.status_code == 429 and "27 lượt" in response.json()["detail"]
        assert not any(call[0] == "api.openai.com" for call in calls)


def test_admin_unlimited_grant_is_rechecked_and_blocking_works_even_for_legacy_allowlist(api):
    grants = [[{"status": "active", "monthly_limit": None}], [{"status": "blocked", "monthly_limit": None}]]
    # Use the existing owner exemption too; managed mode must override it.
    with api(auth_user=google_identity("anhphine1011@gmail.com"), ai_grants=grants, settings_overrides={**MANAGED,
             "api_limits_enabled": True, "ai_unlimited_emails": ["anhphine1011@gmail.com"]}) as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == 200
        reservation = next(call for call in calls if call[1].endswith("reserve_ai_request"))
        assert all(reservation[2][name] is None for name in ("p_user_limit", "p_day_limit", "p_minute_limit", "p_ip_limit"))
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == 403
        assert sum(call[0] == "api.openai.com" for call in calls) == 1
        assert sum(call[1].endswith("reserve_ai_request") for call in calls) == 1


@pytest.mark.parametrize("grant,status", [(None, 404), ({"status": "active", "monthly_limit": 10}, 503),
                                         ({"status": "admin", "monthly_limit": 10}, 200),
                                         ({"status": "active", "monthly_limit": True}, 200),
                                         ({"status": "active", "monthly_limit": -1}, 200)])
def test_missing_or_malformed_table_fails_closed_without_env_fallback(api, grant, status):
    with api(ai_grant=grant, ai_grant_status=status, settings_overrides=MANAGED) as (client, calls):
        response = client.post("/api/v1/ai/extract", json=extraction())
        assert response.status_code == 503 and "Chưa kiểm tra được quyền" in response.json()["detail"]
        assert not any("reserve_ai" in call[1] or call[0] == "api.openai.com" for call in calls)


def test_grant_lookup_uses_verified_owner_and_does_not_trust_submitted_owner_or_metadata(api):
    with api(auth_user={"user_metadata": {"ai_access": "active", "monthly_limit": None}},
             ai_grant={"status": "pending", "monthly_limit": 10}, settings_overrides=MANAGED) as (client, calls):
        assert client.post("/api/v1/ai/extract", json=extraction()).status_code == 403
        auth, lookup = calls[:2]
        assert auth[1] == "/auth/v1/user" and lookup[1] == "/rest/v1/ai_access_grants"
        assert lookup[3]["authorization"] == "Bearer server-secret"
        assert client.post("/api/v1/ai/extract", json=extraction(owner_id=USER_ID)).status_code == 422
        assert not any(call[0] == "api.openai.com" for call in calls)
        assert USER_ID not in json.dumps(client.get("/api/v1/ai/usage").json())


def test_readiness_checks_required_grant_table_when_managed_mode_is_enabled(api):
    with api(ai_grant_status=404, settings_overrides=MANAGED) as (client, _calls):
        assert client.get("/ready").status_code == 503
        assert client.get("/health").json()["managed_ai_access"] is True
