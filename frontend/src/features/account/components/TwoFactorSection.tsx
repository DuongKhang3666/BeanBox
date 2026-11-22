"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  twoFactorBackupCodes,
  twoFactorDisable,
  twoFactorEnable,
  twoFactorSetup,
} from "@/features/auth/api";
import { PasswordField, TextField } from "@/features/auth/components/Fields";
import { FormError, FormNotice } from "@/features/auth/components/FormError";
import { mapAuthError } from "@/features/auth/errors";
import {
  groupSecret,
  normalizeTotp,
  validateAnyCode,
  validateTotp,
} from "@/features/auth/twoFactorCode";
import { validateRequiredPassword } from "@/features/auth/validation";
import { ApiError } from "@/lib/api/errors";
import type { TwoFactorSetup } from "@/types/auth";
import { Section } from "./Section";

/**
 * Xác thực 2 lớp (TOTP) của Staff/Admin (D-063). Luồng: nhập mật khẩu -> quét QR/nhập secret + mã 6 số
 * -> xem mã dự phòng một lần -> trạng thái đã bật (tắt / tạo lại mã dự phòng cần mật khẩu + mã).
 */

type Step =
  | { kind: "idle" }
  | { kind: "password" }
  | { kind: "scan"; setup: TwoFactorSetup }
  | { kind: "codes"; codes: string[]; reason: "enable" | "regenerate" }
  | { kind: "manage"; action: "disable" | "regenerate" };

const CODE_FILE_NAME = "beanbox-ma-du-phong.txt";

function isCodeUserError(err: unknown) {
  return err instanceof ApiError && err.code === "TWO_FACTOR_INVALID";
}
function isPasswordError(err: unknown) {
  return err instanceof ApiError && err.code === "INVALID_PASSWORD";
}

export function TwoFactorSection() {
  const { user, reloadUser } = useAuth();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [notice, setNotice] = useState<string | undefined>();

  if (!user || (user.role !== "STAFF" && user.role !== "ADMIN")) return null;
  const enabled = user.twoFactorEnabled;

  const back = () => setStep({ kind: "idle" });

  return (
    <Section
      title="Xác thực 2 lớp"
      headingId="account-2fa"
      description="Thêm một lớp bảo vệ khi đăng nhập bằng mã dùng một lần từ ứng dụng xác thực trên điện thoại."
    >
      <div className="space-y-4">
        <FormNotice>{notice}</FormNotice>

        {step.kind === "codes" ? (
          <BackupCodes
            codes={step.codes}
            onDone={async () => {
              setNotice(
                step.reason === "enable"
                  ? "Đã bật xác thực 2 lớp. Các thiết bị khác đã bị đăng xuất."
                  : "Đã tạo lại mã dự phòng. Các mã cũ không còn dùng được.",
              );
              back();
              await reloadUser().catch(() => undefined);
            }}
          />
        ) : step.kind === "password" ? (
          <PasswordStep
            onCancel={back}
            onDone={(setup) => {
              setNotice(undefined);
              setStep({ kind: "scan", setup });
            }}
          />
        ) : step.kind === "scan" ? (
          <ScanStep
            setup={step.setup}
            onCancel={back}
            onDone={(codes) => setStep({ kind: "codes", codes, reason: "enable" })}
          />
        ) : step.kind === "manage" ? (
          <ManageStep
            action={step.action}
            onCancel={back}
            onDone={async (codes) => {
              if (step.action === "regenerate" && codes) {
                setStep({ kind: "codes", codes, reason: "regenerate" });
                return;
              }
              setNotice("Đã tắt xác thực 2 lớp. Các thiết bị khác đã bị đăng xuất.");
              back();
              await reloadUser().catch(() => undefined);
            }}
          />
        ) : enabled ? (
          <div className="space-y-3">
            <p>
              Trạng thái:{" "}
              <span className="rounded-full bg-moss-50 px-2.5 py-0.5 text-sm font-medium text-moss-800">
                Đã bật
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setNotice(undefined);
                  setStep({ kind: "manage", action: "regenerate" });
                }}
              >
                Tạo lại mã dự phòng
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setNotice(undefined);
                  setStep({ kind: "manage", action: "disable" });
                }}
              >
                Tắt xác thực 2 lớp
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p>
              Trạng thái:{" "}
              <span className="rounded-full bg-coffee-100 px-2.5 py-0.5 text-sm font-medium text-coffee-800">
                Chưa bật
              </span>
            </p>
            <Button
              onClick={() => {
                setNotice(undefined);
                setStep({ kind: "password" });
              }}
            >
              Bật xác thực 2 lớp
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}

// ───────────── Bước 1: xác nhận mật khẩu ─────────────

function PasswordStep({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (setup: TwoFactorSetup) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    const err = validateRequiredPassword(password) ?? undefined;
    setError(err);
    setFormError(undefined);
    if (err) {
      document.getElementById("tf-setup-password")?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      onDone(await twoFactorSetup(password));
    } catch (e2) {
      if (isPasswordError(e2)) setError("Mật khẩu không đúng");
      else setFormError(mapAuthError(e2).formError);
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-busy={busy}>
      <p className="text-sm text-coffee-800">
        Bạn cần có ứng dụng xác thực trên điện thoại (Google Authenticator, Microsoft Authenticator,
        Authy, ...). Nhập mật khẩu hiện tại để bắt đầu.
      </p>
      <FormError>{formError}</FormError>
      <PasswordField
        id="tf-setup-password"
        label="Mật khẩu hiện tại"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={error}
        readOnly={busy}
        required
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>
          {busy ? "Đang tạo..." : "Tiếp tục"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Hủy
        </Button>
      </div>
    </form>
  );
}

// ───────────── Bước 2: quét QR + nhập mã ─────────────

function ScanStep({
  setup,
  onCancel,
  onDone,
}: {
  setup: TwoFactorSetup;
  onCancel: () => void;
  onDone: (codes: string[]) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    const err = validateTotp(code);
    setError(err);
    setFormError(undefined);
    if (err) {
      document.getElementById("tf-enable-code")?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const { backupCodes } = await twoFactorEnable(normalizeTotp(code));
      onDone(backupCodes);
    } catch (e2) {
      if (isCodeUserError(e2))
        setError("Mã không đúng. Kiểm tra giờ trên điện thoại rồi thử mã mới.");
      else setFormError(mapAuthError(e2).formError);
      setCode("");
      lock.current = false;
      setBusy(false);
      document.getElementById("tf-enable-code")?.focus();
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-busy={busy}>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-coffee-800">
        <li>Mở ứng dụng xác thực và chọn thêm tài khoản mới.</li>
        <li>Quét mã QR bên dưới, hoặc chọn nhập khóa thủ công.</li>
        <li>Nhập mã 6 số mà ứng dụng hiển thị để xác nhận.</li>
      </ol>
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
        {/* Ảnh data URL do backend dựng: CSP storefront và admin cho phép img-src data: */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={setup.qrDataUrl}
          alt="Mã QR để thêm tài khoản BeanBox vào ứng dụng xác thực"
          width={192}
          height={192}
          className="mx-auto h-48 w-48 rounded-lg border border-coffee-200 bg-white"
        />
        <div>
          <p className="text-sm text-coffee-700">Khóa để nhập thủ công:</p>
          <p
            data-testid="tf-secret"
            className="mt-1 font-mono text-lg font-bold tracking-wider break-all text-coffee-900"
            aria-label={`Khóa nhập thủ công: ${setup.secret.split("").join(" ")}`}
          >
            {groupSecret(setup.secret)}
          </p>
          <p className="mt-1 text-xs text-coffee-700">
            Khóa này chỉ hiển thị một lần. Không chia sẻ cho bất kỳ ai.
          </p>
        </div>
      </div>
      <FormError>{formError}</FormError>
      <TextField
        id="tf-enable-code"
        label="Mã 6 số từ ứng dụng"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        spellCheck={false}
        maxLength={7}
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={error}
        readOnly={busy}
        required
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>
          {busy ? "Đang xác nhận..." : "Xác nhận và bật"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Hủy
        </Button>
      </div>
    </form>
  );
}

// ───────────── Bước 3: mã dự phòng (hiện một lần) ─────────────

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void | Promise<void> }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const text = codes.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  }

  function download() {
    const body = `Mã dự phòng BeanBox (mỗi mã chỉ dùng một lần)\n\n${text}\n`;
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = CODE_FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="font-serif text-lg font-bold text-coffee-900 focus:outline-none"
      >
        Lưu mã dự phòng của bạn
      </h3>
      <div
        role="alert"
        className="rounded-lg border border-amber-600/40 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      >
        Các mã này chỉ hiển thị <strong>một lần</strong>. Hãy lưu ở nơi an toàn (trình quản lý mật
        khẩu hoặc bản in cất kỹ). Mỗi mã dùng được một lần khi bạn mất điện thoại; ai có mã cũng
        đăng nhập được nếu biết mật khẩu.
      </div>
      <ul
        aria-label="Danh sách mã dự phòng"
        className="grid grid-cols-1 gap-2 rounded-lg border border-coffee-200 bg-cream-50 p-3 font-mono text-base sm:grid-cols-2"
      >
        {codes.map((c) => (
          <li key={c} data-testid="backup-code">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={copy}>
          Sao chép
        </Button>
        <Button variant="outline" onClick={download}>
          Tải về (.txt)
        </Button>
        <span role="status" className="text-sm text-coffee-700">
          {copied === "ok"
            ? "Đã sao chép."
            : copied === "fail"
              ? "Không sao chép được, hãy chọn và chép thủ công."
              : ""}
        </span>
      </div>
      <label className="flex items-start gap-2 text-sm text-coffee-900">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
        Tôi đã lưu các mã dự phòng ở nơi an toàn
      </label>
      <Button disabled={!saved} onClick={() => void onDone()}>
        Hoàn tất
      </Button>
    </div>
  );
}

// ───────────── Tắt / tạo lại mã dự phòng ─────────────

function ManageStep({
  action,
  onCancel,
  onDone,
}: {
  action: "disable" | "regenerate";
  onCancel: () => void;
  onDone: (codes?: string[]) => void | Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const disabling = action === "disable";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    const fe: Record<string, string> = {};
    const pwErr = validateRequiredPassword(password);
    const codeErr = validateAnyCode(code);
    if (pwErr) fe.password = pwErr;
    if (codeErr) fe.code = codeErr;
    setErrors(fe);
    setFormError(undefined);
    if (fe.password || fe.code) {
      document.getElementById(fe.password ? "tf-manage-password" : "tf-manage-code")?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    const normalized = /^\d{6}$/.test(normalizeTotp(code)) ? normalizeTotp(code) : code.trim();
    try {
      if (disabling) {
        await twoFactorDisable(password, normalized);
        await onDone();
      } else {
        const { backupCodes } = await twoFactorBackupCodes(password, normalized);
        await onDone(backupCodes);
      }
    } catch (e2) {
      if (isPasswordError(e2)) {
        setErrors({ password: "Mật khẩu không đúng" });
        document.getElementById("tf-manage-password")?.focus();
      } else if (isCodeUserError(e2)) {
        setErrors({ code: "Mã không đúng hoặc đã được sử dụng" });
        document.getElementById("tf-manage-code")?.focus();
      } else {
        setFormError(mapAuthError(e2).formError);
      }
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-busy={busy}>
      <p className="text-sm text-coffee-800">
        {disabling
          ? "Tắt xác thực 2 lớp sẽ đăng xuất các thiết bị khác. Nhập mật khẩu và một mã để xác nhận."
          : "Tạo bộ mã dự phòng mới; toàn bộ mã cũ sẽ mất hiệu lực. Nhập mật khẩu và một mã để xác nhận."}
      </p>
      <FormError>{formError}</FormError>
      <PasswordField
        id="tf-manage-password"
        label="Mật khẩu hiện tại"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        readOnly={busy}
        required
      />
      <TextField
        id="tf-manage-code"
        label="Mã xác thực hoặc mã dự phòng"
        type="text"
        inputMode="text"
        autoComplete="one-time-code"
        spellCheck={false}
        maxLength={16}
        hint="Mã 6 số từ ứng dụng, hoặc một mã dự phòng chưa dùng."
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={errors.code}
        readOnly={busy}
        required
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={disabling ? "danger" : "primary"} loading={busy}>
          {disabling ? "Tắt xác thực 2 lớp" : "Tạo mã dự phòng mới"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
