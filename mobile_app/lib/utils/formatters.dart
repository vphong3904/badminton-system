String formatMoney(int value) {
  final text = value.toString();
  final out = StringBuffer();

  for (var i = 0; i < text.length; i++) {
    out.write(text[i]);

    final remaining = text.length - i - 1;
    if (remaining > 0 && remaining % 3 == 0) {
      out.write('.');
    }
  }

  return '$out đ';
}

String formatDate(DateTime date) =>
    '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
