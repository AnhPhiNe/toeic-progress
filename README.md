# TOEIC Progress

Ứng dụng tiếng Việt để theo dõi quá trình luyện TOEIC. Có thể dùng ngay ở chế độ khách; đăng nhập chỉ để đồng bộ nhiều thiết bị. [SPEC.md](SPEC.md) là tài liệu quyết định sản phẩm.

## Chạy cục bộ

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Không điền Supabase thì ứng dụng chạy ở chế độ khách. Khi có dự án staging, điền `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY` vào `.env.local`. Chỉ dùng publishable/anon key ở frontend; không đưa service-role key vào file `VITE_*`.

```powershell
npx tsc --noEmit
npm run lint
npm test
npm run test:e2e
npm run build
```

Playwright dùng Chromium và context riêng. Lần đầu chạy `npx playwright install chromium`. Các kiểm thử có dữ liệu mẫu chụp và phục hồi localStorage trong context thử nghiệm; không chạm profile trình duyệt đang dùng.

## Thiết lập Supabase

1. Tạo **hai dự án riêng**: staging và production. Điền URL/publishable key của staging khi phát triển. Không dùng chung database hoặc Auth users.
2. Áp dụng `supabase/migrations/20260923000000_sync_records.sql` trên cả hai dự án. Kiểm tra bảng `public.sync_records` đã bật RLS và các policy theo `auth.uid()`.
3. Deploy `supabase/functions/delete-account` trên cả hai dự án. Service-role key chỉ tồn tại trong môi trường Edge Function của Supabase. Kiểm tra xóa Auth user làm FK xóa `sync_records`.
4. Bật Google và/hoặc email OTP trong Supabase Auth. Mẫu email phải dùng `{{ .Token }}` để gửi mã sáu chữ số; mẫu dùng `{{ .ConfirmationURL }}` sẽ gửi magic link. Cấu hình Site URL và Redirect URLs cho localhost, `*.pages.dev` staging và tên miền production đã chốt. Trước khi mời người dùng ngoài nhóm quản trị bằng email, cấu hình SMTP riêng.
5. Chạy kiểm thử RLS **chỉ trên staging** với `SUPABASE_TEST_PROJECT=staging`, `SUPABASE_STAGING_URL`, `SUPABASE_STAGING_PUBLISHABLE_KEY`, `SUPABASE_STAGING_SERVICE_ROLE_KEY` trong môi trường terminal (không commit chúng), rồi `npm run test:rls`. Script tạo hai tài khoản tạm và xóa chúng sau khi kiểm thử. Chưa có staging thì chưa thể xác nhận RLS thực tế.

## Triển khai web

- Cloudflare Pages: kết nối repo GitHub private, build command `npm run build`, output directory `dist`, Node 22. Staging dùng subdomain `*.pages.dev`. Cloudflare Pages tự xử lý route SPA nếu không có `404.html` ở root.
- Dùng biến môi trường Supabase **khác nhau** cho staging và production. Điền `VITE_OPERATOR_NAME` và `VITE_SUPPORT_EMAIL` trước khi công bố hai trang pháp lý.
- Trước khi mở công khai: chốt tên miền riêng và xác minh với Google OAuth, kiểm tra giá/gói Supabase production, chuyển gói trả phí theo quyết định dự án, cấu hình SMTP, chạy luồng đăng nhập/xóa tài khoản/RLS trên cả staging và production, rồi kiểm tra giao diện thực tế trên thiết bị.

Hiện chưa có hai dự án Supabase, tên miền và email hỗ trợ, nên bản triển khai trên máy **chưa sẵn sàng mời người dùng công khai**.
