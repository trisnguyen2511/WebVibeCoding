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
  ✓ Proxy đang chạy!
  Target : https://jira.company.com
  Port   : 8765

BƯỚC 4: Cấu hình Timeline App
------------------------------
Vào Timeline → Jira Integration → Connection

  Host  : http://localhost:8765    ← nhập cái này
  Email : your@email.com           (Jira Cloud)
  Token : <API token của bạn>

Bấm "Test Connection" → sẽ thấy "Connected as ..."

BƯỚC 5: Dừng proxy
-------------------
Nhấn Ctrl+C trong cửa sổ proxy, hoặc đóng cửa sổ đi.

====================================================
  LƯU Ý
====================================================
- Proxy chỉ lắng nghe trên localhost — máy khác không
  kết nối vào được, hoàn toàn an toàn.
- Token Jira đi thẳng từ browser → proxy → Jira,
  không qua bất kỳ server nào khác.
- Nếu đổi Jira host, chỉ cần sửa config.json và
  chạy lại run.bat.
====================================================
