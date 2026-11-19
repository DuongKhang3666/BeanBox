"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Label } from "@/components/ui/Input";
import { fieldErrorsOf } from "@/features/admin/errors";
import { useAuth } from "@/features/auth/AuthProvider";
import { FormError, FormNotice } from "@/features/auth/components/FormError";
import { TextField } from "@/features/auth/components/Fields";
import { focusFirstInvalid } from "@/features/auth/components/focus";
import { normalizeEmail, normalizePhone } from "@/features/auth/validation";
import { ApiError, api } from "@/lib/api/client";
import { CONTACT_MESSAGE_MAX, validateContact } from "../contactValidation";

const FIELDS = ["name", "email", "phone", "subject", "message"] as const;
const GENERIC_ERROR = "Không gửi được tin nhắn. Vui lòng thử lại sau ít phút.";
const RATE_LIMIT_ERROR = "Bạn đã gửi quá nhiều tin nhắn, vui lòng thử lại sau ít phút.";

export function ContactForm() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const busy = useRef(false);
  const touchedIdentity = useRef(false);

  // Điền sẵn họ tên/email khi đã đăng nhập (chỉ khi người dùng chưa tự sửa hai ô này).
  useEffect(() => {
    if (!user || touchedIdentity.current) return;
    setName(user.fullName);
    setEmail(user.email);
  }, [user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;

    const fe = validateContact({ name, email, phone, subject, message });
    setErrors(fe);
    setFormError(undefined);
    if (Object.keys(fe).length > 0) {
      focusFirstInvalid(FIELDS, fe);
      return;
    }

    busy.current = true;
    setSubmitting(true);
    try {
      await api.post("/contact", {
        name: name.trim(),
        email: normalizeEmail(email),
        ...(phone.trim() ? { phone: normalizePhone(phone) } : {}),
        ...(subject.trim() ? { subject: subject.trim() } : {}),
        message: message.trim(),
        website,
      });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setFormError(RATE_LIMIT_ERROR);
      } else if (err instanceof ApiError && err.status === 400) {
        const mapped = fieldErrorsOf(err);
        const known: Record<string, string> = {};
        for (const f of FIELDS) if (mapped[f]) known[f] = mapped[f];
        setErrors(known);
        if (Object.keys(known).length > 0) focusFirstInvalid(FIELDS, known);
        else setFormError("Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.");
      } else {
        setFormError(GENERIC_ERROR);
      }
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  function reset() {
    setSubject("");
    setMessage("");
    setWebsite("");
    setErrors({});
    setFormError(undefined);
    setSent(false);
  }

  if (sent) {
    return (
      <div className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-5">
        <FormNotice>Cảm ơn bạn! BeanBox đã nhận được tin nhắn và sẽ phản hồi qua email.</FormNotice>
        <Button variant="outline" onClick={reset}>
          Gửi tin nhắn khác
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-busy={submitting}
      aria-label="Biểu mẫu liên hệ"
      className="space-y-4 rounded-2xl border border-coffee-200 bg-white p-5"
    >
      <FormError>{formError}</FormError>
      <TextField
        id="name"
        label="Họ và tên"
        autoComplete="name"
        value={name}
        onChange={(e) => {
          touchedIdentity.current = true;
          setName(e.target.value);
        }}
        error={errors.name}
        readOnly={submitting}
        required
      />
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => {
          touchedIdentity.current = true;
          setEmail(e.target.value);
        }}
        error={errors.email}
        readOnly={submitting}
        hint="BeanBox sẽ phản hồi qua địa chỉ này."
        required
      />
      <TextField
        id="phone"
        label="Số điện thoại (không bắt buộc)"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        readOnly={submitting}
        hint="Ví dụ 0901234567 hoặc +84901234567"
      />
      <TextField
        id="subject"
        label="Tiêu đề (không bắt buộc)"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        error={errors.subject}
        readOnly={submitting}
      />
      <div>
        <Label htmlFor="message">Nội dung</Label>
        <textarea
          id="message"
          name="message"
          rows={6}
          value={message}
          required
          readOnly={submitting}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? "message-count message-error" : "message-count"}
          onChange={(e) => setMessage(e.target.value)}
          className={`w-full rounded-lg border bg-white px-3 py-2 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600 ${
            errors.message ? "border-danger-600" : "border-coffee-400"
          }`}
        />
        <p
          id="message-count"
          className={`mt-1.5 text-sm ${
            message.length > CONTACT_MESSAGE_MAX ? "text-danger-600" : "text-coffee-700"
          }`}
        >
          {message.length}/{CONTACT_MESSAGE_MAX} ký tự (tối thiểu 10)
        </p>
        <FieldError id="message-error">{errors.message}</FieldError>
      </div>

      {/* Honeypot: nằm ngoài màn hình (không dùng display:none), người thật bỏ trống. */}
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Website (để trống)</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <Button type="submit" size="lg" className="w-full" loading={submitting}>
        {submitting ? "Đang gửi..." : "Gửi tin nhắn"}
      </Button>
      <p className="text-sm text-coffee-700">
        Thông tin bạn nhập chỉ được dùng để phản hồi yêu cầu. Xem{" "}
        <Link
          href="/chinh-sach/bao-mat"
          className="font-medium text-moss-700 underline underline-offset-2 hover:text-moss-600"
        >
          chính sách bảo mật
        </Link>
        .
      </p>
    </form>
  );
}
