import type { ContactMessageItem } from "@/types/adminContact";

export function makeContactMessage(over: Partial<ContactMessageItem> = {}): ContactMessageItem {
  return {
    id: "ckct1",
    userId: null,
    name: "Trần Thị Bình",
    email: "binh@example.com",
    phone: "0901234567",
    subject: "Hỏi về máy xay",
    message: "Xin chào BeanBox,\nmáy xay còn hàng không ạ?",
    status: "NEW",
    adminNote: null,
    handledBy: null,
    handledAt: null,
    createdAt: "2026-11-18T03:00:00.000Z",
    updatedAt: "2026-11-18T03:00:00.000Z",
    ...over,
  };
}
