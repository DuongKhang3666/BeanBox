/**
 * Lưu một Blob thành file tải về qua `<a download>` + object URL (không điều hướng, không đặt
 * token vào URL). Object URL được thu hồi sau khi trình duyệt đã bắt đầu tải.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
