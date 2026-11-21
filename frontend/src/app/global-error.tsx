"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Lớp lỗi cuối cùng (D-059): thay cả layout gốc khi layout/Provider ném lỗi, nên tự có <html>/<body>
 * và không dùng Header/Provider/font. Chỉ cần globals.css (thẻ <link>, không inline script mới nên CSP
 * storefront không bị ảnh hưởng). Chưa có dịch vụ thu lỗi: chỉ log `digest` ra console.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("global-error", error.digest ?? "(không có digest)", error);
  }, [error]);

  return (
    <html lang="vi">
      <body className="bg-cream-50 text-coffee-900">
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-2xl font-bold">Hệ thống đang gặp sự cố</h1>
          <p>Rất tiếc, đã có lỗi ngoài ý muốn. Bạn vui lòng thử lại, hoặc quay về trang chủ.</p>
          {error.digest ? <p className="text-sm text-coffee-700">Mã lỗi: {error.digest}</p> : null}
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 items-center rounded-lg bg-coffee-800 px-5 font-medium text-white"
            >
              Thử lại
            </button>
            {/* Thẻ <a> thường: layout gốc hỏng nên không dựa vào router của Next. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex h-11 items-center rounded-lg border border-coffee-400 px-5 font-medium text-coffee-800"
            >
              Về trang chủ
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
