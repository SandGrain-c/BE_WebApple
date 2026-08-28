# Customer Password Reset

## Runtime flow

Customer Frontend gọi `POST /api/auth/forgot-password` bằng email. Customer API
chỉ cấp token cho tài khoản đang hoạt động có role `Customer`, nhưng luôn trả cùng
status/body cho email tồn tại và không tồn tại.

Token raw được tạo bằng `crypto.randomBytes(32)` và chỉ được đặt trong URL email.
Database lưu SHA-256 của token trong `verification_tokens.token` với
`token_type=PASSWORD_RESET`, `expired_at` và `used_at`.

`POST /api/auth/reset-password` hash token request để lookup, kiểm tra expiry,
account status và role. Conditional token consume và cập nhật `users.pass_hash`
được thực hiện trong cùng Prisma transaction. Request replay hoặc hai request đồng
thời chỉ có thể consume token một lần.

Không có migration mới: model `verification_tokens` hiện tại đã có đầy đủ purpose,
expiry và consumed state. Cột `token` lưu hash, không lưu token raw.

## SMTP configuration

SMTP không bắt buộc để Customer API khởi động. Khi endpoint forgot-password cần gửi
mail, các biến sau phải hợp lệ:

```env
APP_NAME=WebApple
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM=no-reply@example.com
CLIENT_URL=http://localhost:3000
PASSWORD_RESET_TTL_MINUTES=30
PASSWORD_RESET_RATE_LIMIT_WINDOW_MINUTES=15
PASSWORD_RESET_RATE_LIMIT_MAX=20
```

`SMTP_USER` và `SMTP_PASS` phải cùng có hoặc cùng để trống tùy SMTP relay. Không
commit credential thật. `CLIENT_URL` là origin dùng để tạo
`/reset-password?token=...`.

`APP_NAME` là display brand dùng trong subject, text và HTML của email đặt lại mật
khẩu. Có thể đổi brand mà không sửa mail template. `MAIL_FROM` vẫn do môi trường
quản lý và có thể là địa chỉ hoặc mailbox kèm display name theo cấu hình SMTP.

Nếu gửi mail thất bại, token vừa tạo bị xóa và API vẫn trả thông báo generic. Lỗi
được log mà không kèm email, password hoặc raw token.

## Test strategy and limitations

- Unit tests mock Nodemailer; không mở kết nối SMTP.
- Integration tests capture reset URL qua injectable `mailService`, không có debug
  token endpoint.
- Forgot-password dùng IP limiter in-memory của `express-rate-limit`. Khi deploy
  nhiều Customer API replica, cần cấu hình shared store (ví dụ Redis) để quota có
  hiệu lực toàn cụm. Khi đứng sau reverse proxy, deployment cũng phải cấu hình
  Express `trust proxy` đúng topology để `req.ip` không gom mọi user vào IP proxy.
- JWT hiện tại là stateless và không có token version/session table. Reset mật khẩu
  làm old password login thất bại nhưng không revoke access token đã cấp trước đó.
