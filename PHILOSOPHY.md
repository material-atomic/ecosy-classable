# Đạo của Classable (The Tao of Classable)

> _"Đạo sinh nhất, Nhất sinh nhị, Nhị sinh tam, Tam sinh vạn vật."_
> — Lão Tử (Đạo Đức Kinh, Chương 42)

`@ecosy/classable` không chỉ là một thư viện Dependency Injection (DI) hay Inversion of Control (IoC). Nó là một hệ tư tưởng kiến trúc, gọt rửa đi mọi tà thuật của Framework (metadata, decorators, reflection) để đưa kỹ nghệ phần mềm về lại trạng thái nguyên thủy nhất của Toán học và cấu trúc ngôn ngữ.

Kiến trúc lõi của Classable được xây dựng trên sự phản chiếu tuyệt đối của Đạo Đức Kinh:

## Đạo (The Formless Potential): `Classable<T>`

Trong Đạo Đức Kinh có câu: _"Đạo khả đạo, phi thường Đạo"_.

`Classable<T>` không phải là một Class, cũng không phải là một Factory. Nó vô hình, vô tướng. Nó chỉ là **Khả năng trở thành một thực thể (Instance)**.
Tại thời điểm biên dịch (Build-time), nó là lề luật tối thượng bao trùm mọi Type Inference, ép buộc tính Type-Safe tuyệt đối. Nhưng tại thời điểm thực thi (Runtime), nó hoàn toàn biến mất (Type Erasure), không tiêu tốn dù chỉ một byte RAM. Mọi thứ trong hệ thống đều từ nó mà ra, nhưng tự thân nó không là gì cả. Nó chính là Đạo.

## Nhất (The Singularity): `classable.create()`

Từ cái vô hình, vạn vật cần một điểm khởi thủy để bước vào thế giới vật lý.
Hàm `classable.create()` chính là **Phép chiếu (Projection)** duy nhất trong hệ thống. Khác với các framework ôm đồm hàng trăm hàm khởi tạo, `create()` là hàm duy nhất có khả năng biến ý niệm `Classable<T>` thành một thực thể vật lý `T` trên RAM. Nó là vụ nổ Big Bang của hệ thống.

## Nhị (The Duality): `Sync` | `Async`

Thế giới vật lý luôn vận động giữa hai thái cực Âm - Dương. Trong JavaScript, đó là Event Loop.
Phép chiếu của Classable tự động rẽ nhánh thành hai dòng chảy thuận theo tự nhiên:

- **Tính Dương (Sync):** Quyết liệt, đồng bộ, khởi tạo tức thì.
- **Tính Âm (Async/Lazy):** Chờ đợi, lùi lại, nhường luồng cho I/O và mạng lưới.
  Hệ thống không ép buộc, mà luân chuyển uyển chuyển (tùy duyên) theo bản chất của dữ liệu.

## Tam (The Three Dimensions): `Injectable`, `Container`, `Executor`

Từ âm dương vận động, không gian và thời gian được hình thành để chứa đựng vạn vật qua 3 chiều kích:

1. **`Injectable` (Bản ngã):** Đơn vị hạt nhân tự nhận thức được sự tồn tại của chính mình và những thực thể nó cần để tồn tại (Dependencies).
2. **`Container` (Không gian / Tĩnh):** Vùng đất bất diệt bám vào `globalThis`. Nơi lưu giữ sự trường tồn của các Singleton, chống lại sự tàn phá của Hot Module Replacement (HMR).
3. **`Executor` (Thời gian / Động):** Dòng chảy luân hồi. Sinh ra một vùng Lexical Scope khi Request bắt đầu, và buông bỏ toàn bộ (để lại cho Garbage Collector dọn dẹp) khi Request kết thúc. Không rò rỉ bộ nhớ, không tàn dư.

## Vạn Vật (The Ten Thousand Things)

Từ một Type duy nhất, qua một Phép chiếu duy nhất, được đặt vào ba chiều Không - Thời gian, hàng vạn Services, Controllers, Stores, và Database Connections được sinh ra. Chúng cấu thành nên những hệ thống khổng lồ mà không bao giờ sinh ra sự hỗn loạn (Entropy tối thiểu).

---

### Triết lý Vô Vi (The Headless Architecture)

Các Framework hiện đại thường chọn con đường **"Hữu Vi"** — can thiệp thô bạo bằng mã rác, metadata, ép buộc hệ thống phải quét và nạp hàng loạt vào bộ nhớ lúc khởi động.

`@ecosy/classable` chọn con đường **"Vô Vi" (Làm mà như không làm)**. Nó là một kiến trúc **Headless**. Tiên đề đại số không phụ thuộc vào nền tảng. Nó không biết đến Next.js, không biết đến Express, cũng không màng đến Node.js hay Edge Workers. Nó chỉ thiết lập các định luật vật lý (Lexical Scope, Garbage Collection, Type Constraints), sau đó lùi lại, để cho các Class tự do sinh trưởng và tự động phân giải một cách tĩnh lặng.

### Tứ Tuyệt Kiến Trúc

> _Classable sinh — mọi class đều quy về_
> _Factory chuyển — lazy hay sync tùy duyên_
> _Container giữ — Executor buông_
> _Một type duy nhất — vạn vật nên._
