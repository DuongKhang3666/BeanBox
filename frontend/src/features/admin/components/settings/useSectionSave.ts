import { useCallback, useRef, useState } from "react";
import type { AdminSettings as AdminSettingsData } from "@/types/settings";
import { updateAdminSettings, type AdminSettingsResult } from "../../api/settings";
import { adminErrorMessage, fieldErrorsOf } from "../../errors";
import { mapServerFieldErrors, type FieldErrors } from "../../settingsForm";

export interface SaveState {
  busy: boolean;
  notice: string | null;
  general: string[];
  errors: FieldErrors;
}
const IDLE: SaveState = { busy: false, notice: null, general: [], errors: {} };

interface SaveOptions<D> {
  validate: (d: D) => FieldErrors;
  build: (d: D) => Partial<AdminSettingsData>;
  paths: (d: D) => readonly string[];
  onSaved: (r: AdminSettingsResult) => void;
}

/** Validate -> PUT chỉ key của section -> map lỗi 400 về ô nhập. */
export function useSectionSave<D>(opts: SaveOptions<D>) {
  const [state, setState] = useState<SaveState>(IDLE);
  const busyRef = useRef(false);
  async function save(draft: D) {
    if (busyRef.current) return;
    const o = opts;
    const found = o.validate(draft);
    if (Object.keys(found).length > 0) {
      setState({ busy: false, notice: null, general: [], errors: found });
      return;
    }
    busyRef.current = true;
    setState({ busy: true, notice: null, general: [], errors: {} });
    try {
      const result = await updateAdminSettings(o.build(draft));
      setState({ busy: false, notice: "Đã lưu cài đặt.", general: [], errors: {} });
      o.onSaved(result);
    } catch (e) {
      let errors: FieldErrors = {};
      let general: string[] = [];
      const fe = fieldErrorsOf(e);
      if (Object.keys(fe).length > 0) {
        const mapped = mapServerFieldErrors(fe, o.paths(draft));
        errors = mapped.fields;
        general = mapped.general;
        if (Object.keys(errors).length === 0 && general.length === 0) {
          general = [adminErrorMessage(e)];
        }
      } else {
        general = [adminErrorMessage(e)];
      }
      setState({ busy: false, notice: null, general, errors });
    } finally {
      busyRef.current = false;
    }
  }

  const touch = useCallback(() => setState((s) => (s.notice ? { ...s, notice: null } : s)), []);
  const clearErrors = useCallback(() => setState((s) => ({ ...s, errors: {}, general: [] })), []);
  return { state, save, touch, clearErrors };
}
