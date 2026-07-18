# Werewolf GM — Báo cáo test tương tác giữa các vai trò

Test bằng Playwright (trình duyệt thật) trên bản mới nhất ở `staging`. Dưới đây là kết quả, chia theo mức độ.

---

## ✅ Hoạt động đúng

| # | Kịch bản | Kết quả |
|---|----------|---------|
| 1 | **3 Sói cùng lúc** (gán vai trong đêm 1) | Màn hình gán vai bắt đủ chọn cả 3 người mới chuyển sang bước cắn; cả 3 node hiện icon 🐺 trong vòng tròn. |
| 2 | **2 Tiên tri cùng ván** | Mỗi người tự có lượt soi riêng, không bị gộp — soi xong người 1 mới tới người 2. |
| 3 | **2 Bảo vệ cùng ván** | Mỗi người tự có lượt bảo vệ riêng; người bị Sói cắn được 1 trong 2 bảo vệ chọn đúng thì sống. |
| 4 | **Sói cắn → Phù thủy cứu (không chỉ định)** | Đúng người bị cắn được cứu, mũi tên xanh lá vẽ từ Phù thủy tới người được cứu (đã fix ở lần trước). |
| 5 | **Nguyệt Nữ ngủ với 1 Sói duy nhất** | Sói đó bị khóa, không cắn được ai đêm đó. |
| 6 | **Nguyệt Nữ ngủ với 1 trong 2+ Sói** | Bầy vẫn cắn bình thường (không bị ảnh hưởng). |
| 7 | **Tiên tri bị Nguyệt Nữ khóa** | Vẫn hiện kết quả thật (Sói hay không) kèm cảnh báo để MC tự quyết định nói gì. |
| 8 | **Bán Sói bị Sói cắn** | Không chết, roster hiện thêm vai Sói từ đêm sau. |
| 9 | **Thằng Đần bị vote treo cổ** | Thắng cả ván ngay lập tức, không chết thật. |
| 10 | **"Gọi giả" cho vai đã chết / hết lượt** | Đêm sau vẫn được gọi tên (đêm 2+), không bị bỏ qua — giữ bí mật ai đã chết. |
| 11 | **Thợ săn chết đêm → bắn → nạn nhân cũng là Thợ săn** | Bắn dây chuyền hoạt động đúng: người bị bắn (cũng là Thợ săn) lại được kích hoạt lượt bắn tiếp theo. |
| 12 | **Cupid ghép đôi khác phe (Sói + Dân làng)** | Khi Sói bị loại, Dân làng ghép đôi cũng chết dây chuyền theo đúng thiết kế "nếu 1 người chết, người kia chết theo". |

---

## 🐛 Lỗi thật sự (nên sửa)

### 1. Già làng sống sót cả khi bị Sói cắn / thuốc độc — sai với mô tả vai trò
Mô tả vai Già làng ghi: *"Có 2 mạng khi bị dân làng vote loại (**vẫn chết ngay nếu bị Sói cắn hoặc thuốc độc**)"*.

Nhưng test thực tế: Già làng bị Sói cắn (không ai bảo vệ) → **vẫn sống** (mất 1 trong 2 mạng), trái với mô tả. Nguyên nhân: hàm trừ mạng (`killPlayer` trong `derive-game-state.ts`) áp dụng mạng phụ cho **mọi nguyên nhân chết** (đêm, thuốc độc, vote...), không phân biệt như mô tả đã ghi.

**Ảnh hưởng:** Già làng hiện miễn nhiễm 1 lần chết bất kỳ, mạnh hơn dự kiến khá nhiều.

### 2. Vòng tròn tổng kết đêm hiện hình đầu lâu 💀 dù người đó còn sống
Hệ quả trực tiếp của lỗi #1: khi Già làng "chết hụt" nhờ mạng phụ, vòng tròn tổng kết vẫn vẽ 💀 và tô viền đỏ (dựa theo danh sách "deaths" thô của đêm), trong khi dòng trạng thái bên dưới lại ghi đúng "Đang sống". Hai chỗ hiển thị mâu thuẫn nhau, dễ khiến MC tưởng nhầm là chết.

---

## ⚠️ Cần bạn quyết định (không phải lỗi rõ ràng, mà là lựa chọn thiết kế)

### A. Thợ săn (cả 3 biến thể) có hành động **mỗi đêm**, không chỉ khi chết
Hiện tại cả 3 vai Thợ săn đều bật `actsAtNight = true`, nghĩa là **kể cả khi còn sống**, mỗi đêm MC vẫn phải cho Thợ săn chọn 1 mục tiêu như một "Sói phụ" (dù có thể bấm "Bỏ qua lượt"). Điều này không khớp với mô tả "khi chết mới được bắn".

- Nếu đây là chủ ý (Thợ săn có khả năng ám sát mỗi đêm, không chỉ lúc chết) → giữ nguyên, không cần sửa gì.
- Nếu không phải chủ ý → cần sửa để Thợ săn **không** có lượt hành động thường xuyên, chỉ xuất hiện màn "vừa chết, được bắn" khi thực sự chết.

### B. Cặp đôi Cupid khác phe (VD Sói yêu Dân làng) — chỉ chết dây chuyền, chưa có luật "thắng riêng"
Luật cổ điển ở một số nhóm chơi: nếu 2 người yêu nhau là 2 người cuối cùng còn sống (bất kể phe), họ thắng riêng thay vì thắng theo phe Sói/Dân làng. Tool hiện **chỉ** xử lý chết dây chuyền, chưa có luật thắng riêng cho cặp đôi.

- Nếu bạn không chơi theo luật "cặp đôi thắng riêng" → không cần làm gì thêm.
- Nếu có dùng luật này → cần bổ sung điều kiện thắng riêng cho cặp đôi.

---

## Ghi chú nhỏ (không quan trọng)
- Khi 1 vai tự bảo vệ/tự nhắm chính mình, mũi tên trong vòng tròn có độ dài bằng 0 nên không hiện rõ trên giao diện (không ảnh hưởng logic, chỉ là hạn chế hiển thị).

---

**Tóm lại:** 12/12 kịch bản tương tác chính đều đúng. Có 2 lỗi thật cần sửa (Già làng + hiển thị 💀 sai), và 2 điểm cần bạn chọn hướng xử lý (Thợ săn hành động mỗi đêm, luật thắng cặp đôi khác phe).
