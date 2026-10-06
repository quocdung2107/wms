# Warehouse Assistant (app)

Lệnh dev (chạy trong `app/`): `npm run dev`, `npm run build`, `npm run test`, `npm run lint`, `npm run preview`.

## Triển khai lên GitHub Pages

Địa chỉ app: `https://quocdung2107.github.io/wms/`

Các bước làm một lần trên GitHub (repo `wms`):

1. Mở **Settings > Pages**. Ở mục **Build and deployment > Source**, chọn **GitHub Actions**.
2. Mở **Settings > Secrets and variables > Actions**, chuyển sang tab **Variables**, bấm **New repository variable** và thêm 2 biến:
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = anon key (public) của project Supabase
   (Lấy ở Supabase: Project Settings > API. Không dùng service_role key.)
3. Mở tab **Actions**, chạy lại workflow deploy (hoặc push lên `main`). Chờ workflow xanh.
4. Mở `https://quocdung2107.github.io/wms/` kiểm tra app tải được.

## Cấu hình Supabase Auth (cho đăng nhập OTP của Order Chat)

Vào Supabase Dashboard > **Authentication > URL Configuration**:

1. **Site URL** = `https://quocdung2107.github.io/wms/`
2. **Redirect URLs** > Add URL = `https://quocdung2107.github.io/wms/`
3. Bấm Save. Thử đăng nhập OTP trên địa chỉ Pages, đảm bảo quay về đúng địa chỉ này.

(Khi dev cục bộ, có thể thêm thêm `http://localhost:5173/` vào Redirect URLs.)

## Cài vào màn hình chính (PWA)

- **iPhone (Safari)**: mở địa chỉ app > nút Chia sẻ > **Thêm vào Màn hình chính** > Thêm.
- **Android (Chrome)**: mở địa chỉ app > menu ba chấm > **Cài đặt ứng dụng** / **Thêm vào màn hình chính**.
- **Máy tính (Chrome/Edge)**: bấm biểu tượng cài đặt ở cuối thanh địa chỉ.

Lần đầu cần có mạng để tải app; sau đó công cụ kho chạy offline.
