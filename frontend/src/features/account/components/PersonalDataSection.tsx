"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { saveBlob } from "@/features/admin/download";
import { useAuth } from "@/features/auth/AuthProvider";
import { exportPersonalData } from "@/features/auth/api";
import { FormError, FormNotice } from "@/features/auth/components/FormError";
import { ApiError } from "@/lib/api/errors";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { Section } from "./Section";

function exportErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "RATE_LIMITED" || err.status === 429) {
      return "Bạn đã tải dữ liệu quá nhiều lần. Mỗi tài khoản được tải tối đa 5 lần mỗi giờ, vui lòng thử lại sau.";
    }
    if (err.code === "NETWORK_ERROR") {
      return "Không thể kết nối tới máy chủ. Kiểm tra mạng và thử lại.";
    }
  }
  return "Không tải được dữ liệu. Vui lòng thử lại.";
}

/** Quyền với dữ liệu cá nhân (D-065): tải bản sao JSON và (chỉ khách hàng) tự xóa tài khoản. */
export function PersonalDataSection() {
  const { user, endSession } = useAuth();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const busy = useRef(false);

  if (!user) return null;

  async function onExport() {
    if (busy.current) return;
    busy.current = true;
    setExporting(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const { blob, filename } = await exportPersonalData();
      saveBlob(blob, filename);
      setNotice("Đã tạo file dữ liệu cá nhân của bạn.");
    } catch (err) {
      setError(exportErrorMessage(err));
    } finally {
      busy.current = false;
      setExporting(false);
    }
  }

  return (
    <Section
      title="Dữ liệu cá nhân"
      headingId="account-data"
      description="Tải bản sao thông tin BeanBox đang lưu về bạn (hồ sơ, địa chỉ, đơn hàng, đánh giá, yêu thích) dưới dạng file JSON."
    >
      <div className="space-y-4">
        <FormError>{error}</FormError>
        <div aria-live="polite" className="empty:hidden">
          <FormNotice>{notice}</FormNotice>
        </div>
        <Button variant="outline" onClick={onExport} loading={exporting}>
          {exporting ? "Đang tạo file..." : "Tải dữ liệu của tôi (JSON)"}
        </Button>

        {user.role === "CUSTOMER" ? (
          <div className="border-t border-coffee-200 pt-4">
            <h3 className="font-medium text-coffee-900">Xóa tài khoản</h3>
            <p className="mt-1 text-sm text-coffee-700">
              Xóa vĩnh viễn tài khoản và thông tin cá nhân. Đơn hàng cũ được giữ lại ở dạng đã ẩn
              danh. Không thể hoàn tác.
            </p>
            <Button className="mt-3" variant="danger" onClick={() => setConfirming(true)}>
              Xóa tài khoản
            </Button>
          </div>
        ) : null}
      </div>
      {confirming ? (
        <DeleteAccountDialog
          onCancel={() => setConfirming(false)}
          onDeleted={() => {
            endSession();
            router.replace("/?tai-khoan=da-xoa");
          }}
        />
      ) : null}
    </Section>
  );
}
