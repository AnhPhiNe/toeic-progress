# Frontend

React/Vite/TypeScript. Chạy `npm ci` và các lệnh `npm run dev`, `typecheck`, `test`, `build` từ root để dùng workspace và lockfile chung.

- `.env.local` nằm trong thư mục này, tham khảo `.env.example`.
- `src/main.tsx` mở ứng dụng/trang công khai; `src/app` ghép chức năng và điều hướng.
- `src/features` chứa code theo chức năng học; `src/shared` chứa code/kiểu dùng chung. Import `@/` trỏ `src`.
- `public` chỉ chứa tài nguyên chạy thật. HTML thử thiết kế ở `../design/previews`.
- Deploy Vercel với Root Directory `frontend`, framework Vite, output `dist`.

[Bản đồ source](../docs/STRUCTURE.md) · [Hướng dẫn beta](../docs/DEPLOYMENT.md)
