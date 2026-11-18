# Dựng lại database (baseline v2), 11/2026

Project Supabase đang dùng (`toeic-progress-staging`, đang phục vụ như production) có 3 tài khoản và rất ít dữ liệu. Lịch sử migration lệch (các migration được dán tay, chỉ 1/12 được ghi nhận), còn sót đồ Gemini và thiếu `ai_batch_reservations`, `weekly_league`. Chủ dự án đã đồng ý dựng lại schema của app từ đầu. **`auth.*` và bucket `mistake-sources` giữ nguyên.**

Tài liệu này là các bước cho người vận hành. Không bước nào được chạy tự động từ repo.

## Có gì mới

| | v1 (12 migration, nay ở `supabase/migrations/archive/`) | v2 (`20261120000000_baseline_v2.sql`) |
|---|---|---|
| Bảng | domain + kế hoạch tuần, checklist, `sync_records_legacy`, view `sync_records`/`exam_history`, bảng Gemini | chỉ tính năng hiện có (24 bảng); thêm `user_plans`, `redeem_codes`, `redeem_code_uses` |
| Xóa bản ghi | cột `deleted_at` (không bao giờ khác null) + tombstone | chỉ `sync_tombstones`; bảng sống không còn `deleted_at` |
| Tên cột | lẫn `owner_id`/`user_id` | `user_id` ở mọi bảng và RPC (`p_user_id`) |
| Trình duyệt | `authenticated` được SELECT trực tiếp (vượt rate limit), 13 policy | không có quyền gì; RLS bật, không policy; mọi thứ qua backend |
| service_role | ALL trên bảng | SELECT 5 bảng backend đọc + EXECUTE các RPC |
| Hàm | lẫn invoker/definer | mọi hàm `SECURITY DEFINER`, `search_path = ''`, helper trong schema `private` |
| Khóa AI | 1 advisory lock toàn cục | khóa theo tài khoản + khóa dòng theo thứ tự cho hạn mức chung |
| Khóa bucket | lặp ở SQL và Python | chỉ `private.ai_quota_buckets`; Python đọc qua `ai_quota_status` |
| Dọn dẹp | không lịch | `run_maintenance` + GitHub Actions hằng ngày; giải đấu giữ 12 tuần |
| Hạn mức AI riêng | `ai_access_grants.monthly_limit` | `user_plans` (`admin` = không giới hạn); `ai_access_grants` chỉ còn `status` |

Supabase CLI chỉ đọc file `*.sql` nằm trực tiếp trong `supabase/migrations/`, nên thư mục `archive/` không bao giờ được áp dụng. Kiểm tra bằng `supabase migration list` (chỉ thấy `20261120000000`).

## Thiết bị giữ dữ liệu (local-first)

Mỗi thiết bị giữ toàn bộ dữ liệu học trong trình duyệt. Server v2 có một `sync_epoch` mới; lần đồng bộ đầu sau khi dựng lại, app mới thấy epoch khác và **gửi lại mọi bản ghi trên máy một lần** (từng phần nhỏ, server giữ bản mới hơn theo `updated_at`). Vì vậy một dòng mất trên server sẽ quay về từ thiết bị khi:

- thiết bị đó đã chạy bản frontend mới (có epoch) và đăng nhập đúng tài khoản;
- trình duyệt chưa bị xóa dữ liệu, và bản trên máy không vượt quá giới hạn đồng bộ (10.000 bản ghi/tài khoản).

Không đúng khi:

- tab còn chạy bản frontend cũ (chưa tải lại): nó chỉ gửi những gì nó coi là chưa đồng bộ; tải lại trang là đủ;
- chưa thiết bị nào giữ dữ liệu đó (đã xóa trình duyệt, máy mới chưa từng đồng bộ) — chỉ còn bản export ở bước (b);
- bản ghi đã xóa mà tombstone bị mất: thiết bị còn giữ bản cũ sẽ đưa nó trở lại. Bước (e) khôi phục cả tombstone nên điều này chỉ xảy ra nếu bỏ qua restore;
- tài khoản từng **xóa trắng dữ liệu** ở thiết bị khác mà thiết bị này chưa thấy: rào chắn reset (được khôi phục ở bước e) vẫn chặn, đúng như trước.

Dữ liệu không nằm trên thiết bị (quyền AI, bộ đếm lượt AI, giải đấu, ảnh nguồn) không đi theo cơ chế này: quyền AI/plan được khôi phục ở bước (e); bộ đếm lượt và ledger lời giải là dữ liệu tạm, bắt đầu lại từ 0; giải đấu bắt đầu tuần mới (v1 chưa có bảng giải đấu); ảnh trong bucket không bị đụng tới.

## Trước khi bắt đầu

- Deploy cùng lúc: backend và frontend của nhánh này cần schema v2 (RPC đổi tham số sang `p_user_id`). Giữa bước (c) và lúc backend mới chạy, app sẽ báo lỗi đồng bộ; dữ liệu vẫn an toàn trên thiết bị. Chọn giờ vắng (dự án có 3 tài khoản).
- Chuẩn bị: `psql` 15+, chuỗi kết nối `DATABASE_URL` của project (Dashboard → Connect → Session pooler hoặc Direct), Supabase CLI đã `supabase link` tới project.
- Làm một bản dump đầy đủ trước: `python scripts/ops/backup-database.py --output-dir backups` (hoặc `supabase db dump -f backups/full.sql` và `supabase db dump --data-only -f backups/data.sql`).
- Mọi lệnh dưới chạy từ thư mục gốc repo. Không ghi mật khẩu vào file trong repo.

## (a) Kiểm tra chỉ đọc

```sql
-- Đúng project? Có bao nhiêu tài khoản?
select count(*) as users, count(*) filter (where is_anonymous) as guests from auth.users;
-- Đối tượng v1 đang có
select c.relname, c.relkind from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','S') order by 1;
select p.oid::regprocedure from pg_proc p where p.pronamespace in ('public'::regnamespace, to_regnamespace('private')) order by 1;
-- Số dòng sẽ export (so sánh lại ở bước g)
select entity_type, count(*) filter (where deleted_at is null) as live, count(*) filter (where deleted_at is not null) as deleted
  from public.sync_records group by 1 order by 1;
select user_id, status, monthly_limit from public.ai_access_grants;
-- Không có ai khác dùng schema private?
select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'private';
-- Lịch sử migration hiện ghi nhận
select version, name from supabase_migrations.schema_migrations order by 1;
```

Ghi lại kết quả. Nếu có bảng/hàm lạ không thuộc danh sách trong `supabase/rebuild/drop_v1.sql`, dừng lại và hỏi trước.

## (b) Export dữ liệu v1

```bash
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -f supabase/rebuild/export_v1.sql -o v1_export.json
```

`export_v1.sql` chỉ đọc. Kết quả là một dòng JSON gồm: bản ghi đồng bộ theo từng tài khoản ở đúng định dạng app gửi (từ view `sync_records`, đã bỏ checklist/kế hoạch tuần, có cả tombstone), rào chắn reset, `ai_access_grants`, `maxServerVersion`, và bản thô các bảng `user_profiles`, `study_sessions`, `study_session_parts`, `mistakes`, `vocabulary_logs`, `pacing_runs`, `pacing_run_phases`, `streak_shields`, `sync_tombstones`, `learning_data_resets`, `ai_access_grants` để lưu trữ. Chạy lại bao nhiêu lần cũng được.

Kiểm tra: `python -c "import json;d=json.load(open('v1_export.json',encoding='utf-8'));print(d['format'],len(d['records']),d['maxServerVersion'])"`. Cất `v1_export.json` ngoài repo (có dữ liệu cá nhân); không commit.

## (c) Xóa đối tượng app v1

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "set toeic.rebuild_confirm = 'drop-v1'" -f supabase/rebuild/drop_v1.sql
```

(SQL Editor: dán `set toeic.rebuild_confirm = 'drop-v1';` rồi nội dung file, chạy một lần.)

Script từ chối chạy nếu thiếu dòng xác nhận, và không làm gì nếu database đã có baseline v2 (tên bảng trùng). Nó xóa view/bảng/hàm/sequence v1 trong `public`, các helper v1 trong `private` (schema chỉ bị xóa khi rỗng), và trigger v1 `register_ai_access_grant` trên `auth.users`. Không đụng bảng `auth.*`, `storage.*`, bucket hay ảnh. Chạy lại khi đã sạch là no-op.

## (d) Áp dụng baseline

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261120000000_baseline_v2.sql
```

Baseline chạy trong một transaction; nếu còn đối tượng v1 nó dừng và yêu cầu bước (c). Áp dụng lại trên v2 không thay đổi gì. Kiểm tra: `select public.schema_ready();` → `{"baseline": 2, "ready": true}`.

## (e) Khôi phục dữ liệu

Từ thư mục có `v1_export.json`:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /đường/dẫn/repo/supabase/rebuild/load_export.psql
```

`load_export.psql` nạp file JSON vào bảng tạm (đọc nguyên byte) rồi chạy `restore_v2.sql`:

| v1 | v2 |
|---|---|
| bản ghi đồng bộ (profile, sessions + parts, mistakes, vocabLog, pacingRuns + phases, shieldDays, tombstone) | chạy lại qua `public.sync_account_records` — đúng đường app đồng bộ; payload → cột có kiểu, trường giao diện (goalChosen, socCoat, socName, suggestedTasks…) → `user_profiles.extra` |
| checklist, kế hoạch tuần | bỏ (không còn màn hình) |
| `learning_data_resets` | chép nguyên |
| `ai_access_grants.status` | `ai_access_grants.status` (email/tên lấy lại từ Auth) |
| `monthly_limit = NULL` (không giới hạn) | `user_plans.plan = 'admin'` |
| `monthly_limit` khác mặc định 10 | `user_plans.plan = 'free'`, `ai_monthly_limit` = giá trị cũ |
| `server_version` | sequence mới được đặt cao hơn `maxServerVersion`, nên mọi cursor thiết bị cũ vẫn nhận đủ dòng |

Tài khoản không còn trong `auth.users` (hoặc là khách) bị bỏ qua. Chạy lại không thay đổi gì.

Chủ dự án muốn dùng AI không giới hạn mà chưa có trong export (v2 không còn email cứng trong migration):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v email='your-account@gmail.com' -v plan=admin -f supabase/rebuild/set_plan.sql
```

## (f) Ghi nhận lịch sử migration

```bash
supabase migration list                                   # xem bản ghi lệch
supabase migration repair --status reverted <version_v1>  # với mỗi version v1 đang được ghi nhận (thường chỉ 1)
supabase migration repair --status applied 20261120000000
supabase migration list                                   # local và remote chỉ còn 20261120000000
```

Từ nay chỉ thêm migration mới bằng `supabase migration new` + `supabase db push`, không dán tay vào SQL Editor.

## (g) Kiểm tra

```sql
select public.schema_ready();
-- Số dòng: so với bước (a) (checklist/weeklyPlans không còn)
select entity_type, count(*) filter (where deleted_at is null) as live, count(*) filter (where deleted_at is not null) as deleted
  from private.sync_rows group by 1 order by 1;
select * from public.ai_access_grants; select * from public.user_plans;
-- Trình duyệt không có quyền gì (đều phải rỗng)
select table_name, privilege_type, grantee from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon','authenticated');
select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace
  and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
```

- Dashboard → Advisors → Security và Performance: không còn lỗi. Mức INFO "RLS enabled, no policy" là cố ý (trình duyệt không đọc trực tiếp bảng nào).
- Backend mới: `/ready` trả 200; đăng nhập trên máy có dữ liệu, chờ đồng bộ xong, kiểm tra Settings → số bản ghi; thử một lượt AI.
- `npm run test:staging` / `npm run test:rls` (biến môi trường ở đầu script) trên project này.
- GitHub → Actions → "Database maintenance" → Run workflow một lần (cần secrets `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`). Sau đó chạy tự động 03:30 giờ Việt Nam mỗi ngày. Render cron không có ở gói free nên không dùng. Có thể thay bằng `pg_cron` trong Supabase: `select cron.schedule('toeic-maintenance', '30 20 * * *', $$select public.run_maintenance()$$);`.

## Nếu có sự cố

- Trước (c): chưa thay đổi gì, dừng là xong.
- Sau (c), trước khi deploy backend mới: khôi phục từ bản dump (`pg_restore`/`psql` file ở mục chuẩn bị) rồi deploy lại backend cũ.
- Sau (d)/(e): chạy lại `load_export.psql` an toàn; muốn làm lại từ đầu thì xóa các bảng v2 bằng tay (drop_v1 cố ý không xóa v2) rồi lặp lại (d)–(e).

## Việc còn lại (chưa làm trong đợt này)

- Endpoint backend nhập mã (`redeem_code`: HMAC mã bằng `RATE_LIMIT_SECRET` hoặc secret riêng, trả mã lỗi `invalid`/`expired`/`exhausted`/`already_used`/`not_needed`/`rate_limited`), ô nhập mã trong Settings, và lệnh CLI tạo mã (chỉ lưu hash).
- Hiển thị plan/ngày hết hạn trong app.
