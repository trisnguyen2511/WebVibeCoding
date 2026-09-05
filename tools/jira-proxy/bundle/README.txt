====================================================
  JIRA CORS PROXY — Hướng dẫn sử dụng
====================================================

BƯỚC 1: Cấu hình
----------------
Mở file config.json bằng Notepad và sửa:

  "target" : URL Jira nội bộ (bắt buộc)
             Ví dụ: "https://jira.company.com"
                    "https://jira.company.com:8443"

  "port"   : Port proxy chạy trên máy bạn (mặc định 8765)
             Đổi nếu port đó đang bị chiếm bởi app khác.

BƯỚC 2: Kết nối VPN
-------------------
Đảm bảo VPN đang bật và có thể vào được Jira.

BƯỚC 3: Chạy proxy
-------------------
Double-click vào run.bat  (KHÔNG cần quyền Admin)

Cửa sổ sẽ hiện:
  ✓ Proxy đang chạy (HTTPS)!
  Target : https://jira.company.com
  Port   : 8765

BƯỚC 4: Chấp nhận chứng chỉ (CHỈ LÀM 1 LẦN)
----------------------------------------------
Proxy dùng HTTPS với cert tự ký để tránh lỗi CORS của Chrome.
Lần đầu chạy, bạn cần cho Chrome tin tưởng cert này:

  1. Mở Chrome, truy cập:
     https://127.0.0.1:8765/health

  2. Chrome sẽ hiện cảnh báo "Your connection is not private"
     → Click "Advanced"
     → Click "Proceed to 127.0.0.1 (unsafe)"

  3. Nếu thấy {"status":"ok","port":8765} → XONG!
     Chrome đã lưu ngoại lệ, không cần làm lại.

BƯỚC 5: Cấu hình Timeline App
------------------------------
Vào Timeline → Jira Integration → tab "Local Proxy"

  Port  : 8765        ← port bạn đặt ở config.json
  Token : <Personal Access Token của bạn>

Bấm "Chấp nhận cert (bắt buộc lần đầu)" để mở bước 4 nhanh.
Bấm "Test Connection" → sẽ thấy "Connected as ..."

BƯỚC 6: Dừng proxy
-------------------
Nhấn Ctrl+C trong cửa sổ proxy, hoặc đóng cửa sổ đi.

====================================================
  LƯU Ý
====================================================
- Proxy chỉ lắng nghe trên localhost — máy khác không
  kết nối vào được, hoàn toàn an toàn.
- Token Jira đi thẳng từ browser → proxy → Jira,
  không qua bất kỳ server nào khác.
- Cert tự ký chỉ dùng cho 127.0.0.1, không ảnh hưởng
  các website khác.
- Nếu đổi Jira host, chỉ cần sửa config.json và
  chạy lại run.bat.
====================================================
