import base64
import json
from contextlib import contextmanager
from io import BytesIO

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import Settings
from app.main import create_app

OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "33333333-3333-4333-8333-333333333333"


def attachment():
    stream = BytesIO()
    Image.new("RGB", (100, 80), "orange").save(stream, "PNG")
    return {"dataUrl": "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode()}


@contextmanager
def storage_api(*, guest=False, enabled=True, public=False, storage_failure=False, bucket_missing=False):
    objects, calls, refs = {}, [], []
    removed = []
    queries = []

    def respond(request):
        path = request.url.path
        body = json.loads(request.content) if request.headers.get("content-type") == "application/json" and request.content else None
        calls.append((request.method, path, body))
        queries.append((path, dict(request.url.params)))
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": OTHER if request.headers.get("authorization") == "Bearer other" else OWNER, "is_anonymous": guest})
        if path.endswith("/reserve_ai_request"):
            return httpx.Response(200, json={"allowed": True, "remaining": 5, "limit": 10})
        if path.endswith("/mark_account_deletion_pending"):
            return httpx.Response(200, json={"pending": True})
        if path.endswith("/reset_learning_data"):
            return httpx.Response(200, json={"cursor": 10, "records": [], "hasRecords": True, "resetBarrier": True})
        if path == "/rest/v1/mistakes":
            return httpx.Response(200, json=[{"sourceImageIds": refs}])
        if path.startswith("/auth/v1/admin/users/"):
            return httpx.Response(200, json={})
        if path == "/storage/v1/bucket/mistake-sources":
            if bucket_missing:
                return httpx.Response(404, json={"statusCode": "404", "error": "Bucket not found"})
            return httpx.Response(503 if storage_failure else 200, json={"public": public})
        if path == "/storage/v1/object/list/mistake-sources":
            names = [name.split("/")[1] for name in objects if name.startswith(body["prefix"])]
            return httpx.Response(200, json=[{"name": name, "created_at": "2026-01-01T00:00:00Z"}
                                            for name in names[body["offset"]:body["offset"] + body["limit"]]])
        if path == "/storage/v1/object/mistake-sources" and request.method == "DELETE":
            for name in body["prefixes"]:
                removed.append(name)
                objects.pop(name, None)
            return httpx.Response(200, json=[])
        prefix = "/storage/v1/object/mistake-sources/"
        if path.startswith(prefix):
            name = path[len(prefix):]
            if request.method == "POST":
                if name in objects:
                    return httpx.Response(400, json={"error": "Duplicate", "statusCode": "409"})
                objects[name] = request.content
                return httpx.Response(200, json={"Key": name})
            return httpx.Response(200, content=objects[name]) if name in objects else httpx.Response(404)
        sign = "/storage/v1/object/sign/mistake-sources/"
        if path.startswith(sign):
            name = path[len(sign):]
            if name not in objects:
                return httpx.Response(404)
            return httpx.Response(200, json={"signedURL": "/object/sign/mistake-sources/" + name + "?token=temporary"})
        if path == "/v1/responses":
            fields = json.loads(body["input"][0]["content"][0]["text"])
            draft = {"part": fields["part"], "question": fields["question"], "context": "Unexpected OCR text to discard.",
                     "category": "OTHER", "userMistake": "", "correctAnswer": fields["options"][1], "options": fields["options"],
                     "tags": [], "missingInformation": [], "answerSource": "AI_PROPOSED", "userChoice": "",
                     "optionNotes": [{"label": letter, "pos": "", "meaning": "Meaning"} for letter in "ABCD"],
                     "explanation": {key: "" for key in ("quickTip", "translation", "questionType", "evidence", "paraphrase", "analysis", "keyVocabulary")}}
            return httpx.Response(200, json={"status": "completed", "output": [{"type": "message", "role": "assistant", "status": "completed",
                                            "content": [{"type": "output_text", "text": json.dumps(draft)}]}]})
        raise AssertionError(path)

    settings = Settings(_env_file=None, supabase_url="https://database.example", supabase_publishable_key="public",
                        supabase_secret_key="secret", rate_limit_secret="rate", openai_api_key="private", source_images_enabled=enabled)
    with TestClient(create_app(settings, httpx.MockTransport(respond))) as client:
        client.headers["Authorization"] = "Bearer owner"
        client.queries = queries
        yield client, objects, calls, refs, removed


def test_upload_is_deduplicated_private_owner_scoped_and_survives_reuse():
    with storage_api() as (client, objects, calls, _refs, _removed):
        ids = client.post("/api/v1/mistake-images", json={"images": [attachment()]}).json()["sourceImageIds"]
        assert len(ids) == 1 and len(ids[0]) == 64
        assert client.post("/api/v1/mistake-images", json={"images": [attachment(), attachment()]}).json()["sourceImageIds"] == ids
        assert len(objects) == 1 and next(iter(objects)).startswith(OWNER + "/")
        response = client.post("/api/v1/mistake-images/urls", json={"sourceImageIds": ids})
        assert response.status_code == 200 and "/" + OWNER + "/" in response.json()["images"][0]["url"]
        client.headers["Authorization"] = "Bearer other"
        assert client.post("/api/v1/mistake-images/urls", json={"sourceImageIds": ids}).status_code == 404
        assert not any(path == "/v1/responses" for _, path, _ in calls)


def test_saved_images_reach_one_ai_call_without_ocr_and_foreign_ids_never_spend_quota():
    with storage_api() as (client, _objects, calls, _refs, _removed):
        ids = client.post("/api/v1/mistake-images", json={"images": [attachment()]}).json()["sourceImageIds"]
        fields = {"part": 7, "question": "What is the delivery time?", "options": ["(A) One day.", "(B) Three days.", "(C) Five days.", "(D) Ten days."],
                  "userChoiceState": "UNKNOWN"}
        body = {"text": json.dumps(fields), "input": fields, "sourceImageIds": ids, "provider": "openai", "consent": True,
                "request_id": "22222222-2222-4222-8222-222222222222"}
        response = client.post("/api/v1/ai/extract", json=body)
        assert response.status_code == 200
        draft = response.json()["draft"]
        assert draft["context"] == "" and draft["questionContext"] == fields["question"]
        assert not any("trích từ ảnh" in message for message in draft["missingInformation"])
        provider = next(body for _, path, body in calls if path == "/v1/responses")
        assert provider["text"]["format"]["schema"]["properties"]["context"]["enum"] == [""]
        assert provider["input"][0]["content"][1]["type"] == "input_image"
        assert sum(path == "/v1/responses" for _, path, _ in calls) == 1
        calls.clear()
        client.headers["Authorization"] = "Bearer other"
        assert client.post("/api/v1/ai/extract", json=body).status_code == 404
        assert not any(path.endswith("reserve_ai_request") or path == "/v1/responses" for _, path, _ in calls)


@pytest.mark.parametrize("mode", ["guest", "disabled", "public", "invalid"])
def test_storage_fails_closed_before_writing_or_calling_ai(mode):
    with storage_api(guest=mode == "guest", enabled=mode != "disabled", public=mode == "public") as (client, objects, calls, _refs, _removed):
        response = client.post("/api/v1/mistake-images", json={"images": [attachment()] if mode != "invalid" else [{"dataUrl": "https://example.com/image.jpg"}]})
        assert response.status_code == {"guest": 403, "disabled": 503, "public": 503, "invalid": 422}[mode]
        assert not objects and not any(path == "/v1/responses" for _, path, _ in calls)
        assert client.post("/api/v1/mistake-images/urls", json={"sourceImageIds": ["../../other/file"]}).status_code == (403 if mode == "guest" else 422)


def test_cleanup_preserves_images_still_referenced_and_only_deletes_the_owner_prefix():
    with storage_api() as (client, objects, _calls, refs, removed):
        kept = "a" * 64
        orphan = "b" * 64
        objects.update({OWNER + "/" + kept + ".jpg": b"1", OWNER + "/" + orphan + ".jpg": b"2", OTHER + "/" + orphan + ".jpg": b"3"})
        refs.append(kept)
        assert client.post("/api/v1/mistake-images/cleanup", json={"before": "2026-02-01T00:00:00Z"}).status_code == 200
        assert removed == [OWNER + "/" + orphan + ".jpg"]
        assert OWNER + "/" + kept + ".jpg" in objects and OTHER + "/" + orphan + ".jpg" in objects


def test_reset_reports_deferred_cleanup_instead_of_claiming_a_rollback():
    with storage_api(storage_failure=True) as (client, _objects, calls, _refs, _removed):
        response = client.post("/api/v1/data/reset", json={"confirm": True})
        assert response.status_code == 200 and response.json()["resetBarrier"]
        assert response.json()["sourceImageCleanupBefore"]
        assert sum(path.endswith("reset_learning_data") for _, path, _ in calls) == 1


def test_storage_limit_rejects_new_files_without_removing_or_replacing_existing_images():
    with storage_api() as (client, objects, calls, _refs, _removed):
        for index in range(200):
            objects[OWNER + "/" + f"{index:064x}" + ".jpg"] = b"existing"
        response = client.post("/api/v1/mistake-images", json={"images": [attachment()]})
        assert response.status_code == 429 and len(objects) == 200
        assert not any(method == "POST" and path.startswith("/storage/v1/object/mistake-sources/") for method, path, _ in calls)


def test_synced_image_ids_are_preserved_but_urls_and_wrong_parts_are_rejected_before_database_write():
    with storage_api(enabled=False) as (client, _objects, calls, _refs, _removed):
        # Use an independent mock here: sync is not part of the storage test transport.
        from app.schemas.models import Mistake
        fields = {"id": "note", "part": 7, "category": "OTHER", "status": "NEEDS_REVIEW", "questionContext": "Q",
                  "userMistake": "", "correctAnswer": "", "tags": [], "createdAt": "2026-01-01T00:00:00Z", "sourceImageIds": ["a" * 64]}
        assert Mistake.model_validate_json(json.dumps(fields)).model_dump()["sourceImageIds"] == ["a" * 64]
        for changes in ({"sourceImageIds": ["https://other.example/img"]}, {"part": 5}, {"sourceImageIds": ["a" * 64] * 2}):
            with pytest.raises(ValueError):
                Mistake.model_validate_json(json.dumps({**fields, **changes}))
        assert not calls


def test_reset_and_delete_still_clean_stored_images_when_flag_is_disabled():
    with storage_api(enabled=False) as (client, objects, calls, _refs, removed):
        orphan = "c" * 64
        objects[OWNER + "/" + orphan + ".jpg"] = b"old"
        reset = client.post("/api/v1/data/reset", json={"confirm": True})
        assert reset.status_code == 200 and not reset.json().get("sourceImageCleanupBefore")
        assert removed == [OWNER + "/" + orphan + ".jpg"] and not objects
        # Deterministic pagination ordering prevents skipping live references or objects on >1,000 rows.
        mistakes_query = next(params for path, params in client.queries if path == "/rest/v1/mistakes")
        assert mistakes_query.get("order") == "id.asc"
        list_body = next(body for _, path, body in calls if path == "/storage/v1/object/list/mistake-sources")
        assert list_body.get("sortBy") == {"column": "name", "order": "asc"}

        # Account deletion also purges previously stored objects even while uploads are disabled.
        objects[OWNER + "/" + ("d" * 64) + ".jpg"] = b"old-2"
        deleted = client.delete("/api/v1/account")
        assert deleted.status_code == 200 and not objects


def test_reset_and_delete_succeed_quietly_when_bucket_does_not_exist():
    with storage_api(enabled=False, bucket_missing=True) as (client, _objects, _calls, _refs, _removed):
        reset = client.post("/api/v1/data/reset", json={"confirm": True})
        assert reset.status_code == 200 and not reset.json().get("sourceImageCleanupBefore")
        assert client.delete("/api/v1/account").status_code == 200
