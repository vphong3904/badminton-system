/// Home gọi hàm này để mở màn đăng nhập/đăng ký; trả true nếu đăng nhập thành công.
typedef AuthenticateCallback = Future<bool> Function(bool initialRegister);
