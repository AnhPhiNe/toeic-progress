# TOEIC Progress

Ứng dụng tiếng Việt để ghi kết quả luyện TOEIC, theo dõi tiến bộ, lưu lỗi sai, ôn tập, từ vựng và kế hoạch. Frontend dùng React/Vite/TypeScript; backend Python/FastAPI; Supabase cung cấp PostgreSQL/Auth; OpenAI/Gemini được gọi từ backend.

## Cấu trúc source

```text
frontend/       Ứng dụng web, cấu hình Vite và tài nguyên public
  src/app/      Khung ứng dụng và điều hướng
  src/features/ Các chức năng: tài khoản, buổi học, lỗi sai, kế hoạch...
  src/shared/   Kiểu dữ liệu, lưu trữ, API và logic dùng chung
backend/        FastAPI, cấu hình Render và kiểm thử Python
  app/api/      Các route và dependency xác thực
  app/core/     Cấu hình, middleware và lớp bảo vệ vận hành
  app/schemas/  Kiểm tra payload đầu vào
  app/services/ Logic xử lý nghiệp vụ
  app/integrations/ Giao tiếp Supabase/OpenAI/Gemini
  app/commands/ Công cụ bảo trì
supabase/       Migration database đã được đánh phiên bản
tests/          Kiểm thử trình duyệt, database và staging
scripts/        Công cụ sinh migration, tạo asset và backup
docs/           Đặc tả, bản đồ source và hướng dẫn deploy
design/         Các bản HTML thử giao diện, không đưa vào bản deploy
```

[Bản đồ source và quy tắc thêm code](docs/STRUCTURE.md) · [Đặc tả sản phẩm](docs/SPEC.md) · [Đưa vào beta](docs/DEPLOYMENT.md)

## Chạy local

Chạy các lệnh npm từ thư mục gốc. Repo dùng npm workspace `frontend`, một `package-lock.json` chung.

```powershell
npm ci
# Chỉ copy khi chưa có file cấu hình riêng.
Copy-Item frontend/.env.example frontend/.env.local
npm run dev
```

Frontend chạy cổng 3000. Chưa có dịch vụ vẫn dùng tracker khách. `.env.local` nằm trong `frontend`; chỉ đặt publishable key và các biến `VITE_*` công khai tại đây.

Backend chạy từ thư mục gốc:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
# Chỉ copy khi chưa có file cấu hình riêng.
Copy-Item backend/.env.example backend/.env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --env-file backend/.env --reload --port 8000
```

Giữ secret key/API key AI ở `backend/.env`. Để dùng OpenAI trực tiếp: `AI_PROVIDER=openai`, `OPENAI_API_KEY` là một chuỗi, `OPENAI_MODEL=gpt-6-luna`, `OPENAI_REASONING_EFFORT=medium`. Google login bật đồng bộ; khách vẫn lưu trên thiết bị. Các khóa localStorage và giao thức đồng bộ được giữ nguyên. Xem [backend/README.md](backend/README.md) cho xác thực, schema và quota.

## Kiểm tra

```powershell
npm run typecheck
npm run lint
npm test
npm run test:db
npm run test:e2e
npm run build
.\.venv\Scripts\python.exe -m pytest backend/tests -c backend/pyproject.toml
.\.venv\Scripts\python.exe -m ruff check backend scripts/ops/backup-database.py
```

Vitest ở frontend và test Python ở backend. Test SQL dùng PostgreSQL trong bộ nhớ; Playwright dùng context/cổng 3100 riêng, tắt Supabase/AI thật. Test staging cần biến riêng và không chạy trên project chứa dữ liệu thật.

## Deploy beta

Vercel: **Root Directory `frontend`**, framework Vite, build `npm run build`, output `dist`. Cấu hình route/security headers nằm ở `frontend/vercel.json`. Render: Root Directory `backend`, Blueprint `backend/render.yaml`.

Beta bắt đầu với tracker, `AI_ENABLED=false`. Áp dụng năm migration đầu trước khi bật API limits. Chế độ Gemini dùng thêm migration `20261007000000_gemini_provider_pool.sql` cho cân bằng project/key và cooldown; OpenAI không cần migration này. [Hướng dẫn triển khai](docs/DEPLOYMENT.md) có biến môi trường, Google login, backup/restore và kiểm thử staging.

Full Test có thể ước tính theo số câu đúng hoặc nhập điểm L/R/chỉ tổng. Điểm nhập được ưu tiên; bảng quy đổi chỉ là tham khảo chưa hiệu chuẩn cho từng đề. Hiện chưa có thanh toán hay kết quả kiểm thử sức chứa cộng đồng.
