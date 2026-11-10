/** Đưa focus vào ô lỗi đầu tiên (theo thứ tự hiển thị) để người dùng dùng bàn phím/đọc màn hình biết chỗ sửa. */
export function focusFirstInvalid(orderedIds: readonly string[], errors: Record<string, string>) {
  const id = orderedIds.find((x) => errors[x]);
  if (id) document.getElementById(id)?.focus();
}
