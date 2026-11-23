import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../booking/data/booking_api.dart';
import '../../../models/booking_model.dart';

/// Form nhập/sửa tài khoản nhận hoàn tiền (G4.7). Không bắt buộc: khách bỏ qua thì chủ sân gọi SĐT.
/// Trả true khi đã lưu thành công để màn gọi tải lại danh sách.
Future<bool> showRefundAccountSheet(
  BuildContext context, {
  required int bookingId,
  int refundAmount = 0,
}) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _RefundAccountForm(bookingId: bookingId, refundAmount: refundAmount),
  );
  return saved == true;
}

class _RefundAccountForm extends StatefulWidget {
  final int bookingId;
  final int refundAmount;

  const _RefundAccountForm({required this.bookingId, required this.refundAmount});

  @override
  State<_RefundAccountForm> createState() => _RefundAccountFormState();
}

class _RefundAccountFormState extends State<_RefundAccountForm> {
  final _numberCtrl = TextEditingController();
  final _holderCtrl = TextEditingController();

  List<BankOption> _banks = const [];
  BankOption? _bank;
  bool _loadingBanks = true;
  bool _saving = false;
  String? _error; // lỗi chung (do máy chủ báo)
  String? _bankError;
  String? _numberError;
  String? _holderError;

  @override
  void initState() {
    super.initState();
    _loadBanks();
  }

  @override
  void dispose() {
    _numberCtrl.dispose();
    _holderCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadBanks() async {
    final banks = await BookingApi.fetchBanks();
    if (!mounted) return;
    setState(() {
      _banks = banks;
      _loadingBanks = false;
    });
  }

  /// Kiểm tra giống backend (số TK 6–30 chữ số sau khi bỏ dấu cách/gạch, tên chủ TK 2–100 ký tự).
  /// Lỗi hiện ngay dưới từng ô để khách thấy rõ cần sửa gì.
  bool _validate() {
    String? bankError;
    String? numberError;
    String? holderError;
    if (_bank == null) bankError = 'Vui lòng chọn ngân hàng.';
    final number = _numberCtrl.text.replaceAll(RegExp(r'[\s-]'), '');
    if (number.isEmpty) {
      numberError = 'Vui lòng nhập số tài khoản.';
    } else if (!RegExp(r'^\d{6,30}$').hasMatch(number)) {
      numberError = 'Số tài khoản chỉ gồm 6–30 chữ số.';
    }
    final holder = _holderCtrl.text.trim();
    if (holder.length < 2) {
      holderError = 'Vui lòng nhập tên chủ tài khoản.';
    } else if (holder.length > 100) {
      holderError = 'Tên chủ tài khoản tối đa 100 ký tự.';
    }
    setState(() {
      _bankError = bankError;
      _numberError = numberError;
      _holderError = holderError;
      _error = null;
    });
    return bankError == null && numberError == null && holderError == null;
  }

  Future<void> _save() async {
    if (!_validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await BookingApi.updateRefundAccount(
        widget.bookingId,
        bank: _bank!,
        accountNumber: _numberCtrl.text,
        holderName: _holderCtrl.text,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Chưa lưu được tài khoản. Bạn kiểm tra mạng rồi thử lại nhé.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 4, 20, 20 + bottomInset),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Tài khoản nhận hoàn tiền',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
              if (widget.refundAmount > 0) ...[
                const SizedBox(height: 4),
                Text(
                  'Số tiền hoàn dự kiến: ${formatMoney(widget.refundAmount)}',
                  style: const TextStyle(color: AppTheme.hintGrey),
                ),
              ],
              const SizedBox(height: 6),
              const Text(
                'Nhập đúng tài khoản của bạn để chủ sân chuyển khoản hoàn nhanh. '
                'Bạn có thể bỏ qua, chủ sân sẽ liên hệ qua số điện thoại.',
                style: TextStyle(fontSize: 13, height: 1.35),
              ),
              const SizedBox(height: 14),
              if (_loadingBanks)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Center(child: CircularProgressIndicator()),
                )
              else
                DropdownButtonFormField<BankOption>(
                  initialValue: _bank,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: 'Ngân hàng',
                    errorText: _bankError,
                    border: const OutlineInputBorder(),
                  ),
                  items: [
                    for (final bank in _banks)
                      DropdownMenuItem(value: bank, child: Text('${bank.name} (${bank.code})')),
                  ],
                  onChanged: _saving
                      ? null
                      : (value) => setState(() {
                            _bank = value;
                            _bankError = null;
                          }),
                ),
              const SizedBox(height: 12),
              TextField(
                controller: _numberCtrl,
                enabled: !_saving,
                keyboardType: TextInputType.number,
                maxLength: 30,
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9 -]'))],
                onChanged: (_) {
                  if (_numberError != null) setState(() => _numberError = null);
                },
                decoration: InputDecoration(
                  labelText: 'Số tài khoản',
                  counterText: '',
                  errorText: _numberError,
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _holderCtrl,
                enabled: !_saving,
                textCapitalization: TextCapitalization.characters,
                maxLength: 100,
                onChanged: (_) {
                  if (_holderError != null) setState(() => _holderError = null);
                },
                decoration: InputDecoration(
                  labelText: 'Tên chủ tài khoản',
                  counterText: '',
                  errorText: _holderError,
                  border: const OutlineInputBorder(),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(_error!, style: const TextStyle(color: AppTheme.danger, fontSize: 13)),
              ],
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _saving ? null : () => Navigator.of(context).pop(false),
                      child: const Text('Để sau'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: _saving || _loadingBanks ? null : _save,
                      child: _saving
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Text('Lưu tài khoản'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
