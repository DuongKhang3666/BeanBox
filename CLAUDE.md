# BeanBox – E-commerce đồ cà phê

Web full-stack bán dụng cụ/phụ kiện/hạt cà phê. Ngôn ngữ UI: tiếng Việt, tiền tệ VND.

## Stack mặc định (đổi nếu muốn)
- Frontend: Next.js (React) + TypeScript + Tailwind  → `frontend/`
- Backend: Node.js + Express/Fastify + TypeScript + Prisma → `backend/`
- DB: PostgreSQL. Thanh toán: Stripe (test mode) hoặc VNPay sandbox.
- Docs/thiết kế: `docs/`

## Quy ước
- Contract API là nguồn sự thật: `docs/api-contract.md`.
- Không commit secrets; dùng `.env.example`.
- Mỗi tính năng: architect → backend/frontend → qa → security → (devops).
- Dùng agent `beanbox-lead` điều phối; agent phụ nằm trong `.claude/agents/`.
