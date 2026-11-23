/// Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu.
String removeDiacritics(String value) {
  var result = value.toLowerCase().trim();

  const groups = <String, String>{
    'a': 'áàảãạăắằẳẵặâấầẩẫậ',
    'e': 'éèẻẽẹêếềểễệ',
    'i': 'íìỉĩị',
    'o': 'óòỏõọôốồổỗộơớờởỡợ',
    'u': 'úùủũụưứừửữự',
    'y': 'ýỳỷỹỵ',
    'd': 'đ',
  };

  for (final entry in groups.entries) {
    for (final character in entry.value.split('')) {
      result = result.replaceAll(character, entry.key);
    }
  }

  return result;
}
