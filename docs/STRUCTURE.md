# Đọc và mở rộng source

## Điểm bắt đầu

| Cần tìm | Điểm bắt đầu |
|---|---|
| Trang nào được mở, khung ứng dụng | `frontend/src/main.tsx`, `frontend/src/app/App.tsx` |
| Sidebar/Topbar, onboarding, lỗi khởi động | `frontend/src/app/components/` |
| Đường dẫn URL và tab | `frontend/src/app/routing/` |
| Đăng nhập, chuyển guest sang tài khoản, đồng bộ | `frontend/src/features/account/` |
| Ghi kết quả, sửa lịch sử, nhập điểm | `frontend/src/features/study-sessions/` |
| Phân tích điểm và lỗi | `frontend/src/features/analytics/` |
| Sổ lỗi, AI nhập lỗi, quiz và ôn giãn cách | `frontend/src/features/mistakes/` |
| Mục tiêu tuần | `frontend/src/features/plans/` |
| Từ vựng, bấm giờ, bảng điểm | `frontend/src/features/vocabulary/`, `pacing/`, `resources/` |
| Dashboard/streak và trang công khai | `frontend/src/features/dashboard/`, `public-pages/` |
| Dữ liệu local, backup, reset và merge | `frontend/src/shared/data/` |
| Transport API, client Supabase | `frontend/src/shared/api/` |
| Quy đổi tham khảo, streak, phân tích chung | `frontend/src/shared/domain/` |
| Khai báo kiểu dữ liệu | `frontend/src/shared/types/index.ts` |
| Ghép cấu hình thành FastAPI app | `backend/app/main.py` |
| Các endpoint | `backend/app/api/routes/` |
| Xác thực và phân quyền endpoint | `backend/app/api/dependencies.py` |
| Cấu hình, ingress guard, log | `backend/app/core/` |
| Ràng buộc dữ liệu | `backend/app/schemas/models.py` |
| Gọi Supabase/Gemini | `backend/app/integrations/gateway.py` |
| Kiểm tra bản nháp AI theo đầu vào | `backend/app/services/ai_grounding.py` |
| Bảo trì | `backend/app/commands/maintenance.py` |
| RLS, giao dịch đồng bộ và quota | `supabase/migrations/` |

## Quy tắc tổ chức

- Code riêng cho một chức năng đặt trong `features/<chức-năng>/`, chia `components`, `hooks`, `services` hoặc `lib` khi có code tương ứng. Test frontend đặt cạnh file được kiểm thử.
- Khung ứng dụng ở `app` ghép các chức năng. Thành phần `shared` dùng chung, không phụ thuộc component giao diện của một chức năng. Giữ interface dữ liệu nhỏ; tránh tạo một lớp bọc chỉ để đổi tên lời gọi.
- Import frontend dùng `@/` trỏ `frontend/src`. Alias đã được cấu hình đồng bộ trong TypeScript, Vite và Vitest. Không cần giữ file re-export ở vị trí cũ.
- Backend route nhận/xác thực request và gọi xử lý; cấu hình/middleware nằm trong `core`, payload trong `schemas`, nhà cung cấp ngoài app trong `integrations`.
- Endpoint, khóa localStorage, tên migration và schema vẫn giữ nguyên. Tổ chức thư mục không phải thay đổi dữ liệu nghiệp vụ.
- npm chạy từ root với workspace `frontend`; không tạo thêm lockfile trong frontend. Dùng `npm run typecheck` thay cho chạy tsc ở thư mục gốc.

## Kiểm thử và công cụ

`tests/e2e` kiểm tra luồng người dùng; `tests/database` kiểm tra migration/RLS/quota bằng PGlite; `tests/staging` dùng cấu hình staging riêng. Test Python nằm trong `backend/tests`.

`scripts/database` sinh SQL migration; `scripts/assets` tạo icon; `scripts/ops` backup. Không chạy bộ sinh migration chỉ để đổi định dạng một migration đã áp dụng. File SQL đã áp dụng cần được giữ nguyên và thay đổi schema bằng migration mới.

Các bản thử giao diện được giữ tại `design/previews`, không nằm trong public assets. `scratch` chứa công cụ/screenshot tạm trên máy và bị Git bỏ qua. Dữ liệu backup, môi trường riêng và cache cũng bị bỏ qua.

## Thay đổi đường dẫn quan trọng

| Trước | Hiện tại |
|---|---|
| `.env.local` của frontend ở root | `frontend/.env.local` |
| Root Directory Vercel là root | Root Directory Vercel là `frontend` |
| `SPEC.md` | `docs/SPEC.md` |
| `backend/RELEASE.md` | `docs/DEPLOYMENT.md` |
| `scripts/backup-database.py` | `scripts/ops/backup-database.py` |
| `python -m app.maintenance` | `python -m app.commands.maintenance` |

Các lệnh npm phổ biến và cổng local giữ nguyên; Root Directory Render vẫn là `backend`.
