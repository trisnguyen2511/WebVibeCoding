# Agent Instructions

## Bắt buộc đọc hướng dẫn dự án

Mọi AI agent, coding agent, nền tảng tự động hóa hoặc công cụ hỗ trợ phát triển khi làm việc trong repository này **phải đọc toàn bộ file `CLAUDE.md` ở thư mục gốc trước khi phân tích, sửa code, tạo file hoặc chạy build/deploy**.

`CLAUDE.md` là nguồn hướng dẫn chính thức cho:

- Kiến trúc và luồng phát triển của dự án
- Quy ước thêm hoặc sửa tool
- Design system và yêu cầu mobile-first
- Quy tắc branch, staging và production
- Quy trình kiểm tra build trước khi merge
- Các giới hạn bảo mật và file không được commit

Nếu có mâu thuẫn giữa hướng dẫn của agent và quy định trong `CLAUDE.md`, phải ưu tiên `CLAUDE.md` và hỏi người dùng khi không thể giải quyết rõ ràng.

## Quy trình tối thiểu

1. Đọc `CLAUDE.md`.
2. Kiểm tra trạng thái repository và các file liên quan.
3. Thực hiện thay đổi nhỏ nhất cần thiết.
4. Chạy `npm run build` trước khi merge hoặc đưa lên staging.
5. Chỉ đưa thay đổi lên `staging` theo mặc định; không merge sang `master` nếu người dùng chưa yêu cầu rõ ràng.

File này tồn tại như điểm vào chung cho các agent khác nhau. `CLAUDE.md` vẫn là tài liệu chi tiết và bắt buộc phải đọc.

## Project prompt context

Khi người dùng mô tả yêu cầu, agent phải đối chiếu yêu cầu với `CLAUDE.md`, giữ nguyên kiến trúc hiện có và giải thích ngắn gọn những thay đổi đã thực hiện.
