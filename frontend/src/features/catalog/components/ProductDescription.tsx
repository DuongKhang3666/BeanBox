import { Fragment } from "react";

type Block =
  { type: "p"; text: string } | { type: "h"; text: string } | { type: "ul"; items: string[] };

const BULLET = /^\s*[-*]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

/** Tách Markdown đơn giản (đoạn, tiêu đề #, gạch đầu dòng "- ") thành các khối. Không sinh HTML. */
export function parseDescription(source: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  const flushList = () => {
    if (list?.length) blocks.push({ type: "ul", items: list });
    list = null;
  };

  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    const bullet = BULLET.exec(line);
    const heading = HEADING.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (bullet) {
      flushPara();
      (list ??= []).push((bullet[1] ?? "").trim());
    } else if (heading) {
      flushPara();
      flushList();
      blocks.push({ type: "h", text: (heading[1] ?? "").trim() });
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
}

/** Chữ đậm **...** thành <strong>; mọi thứ khác là text thuần (React tự escape). */
function Inline({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

export function ProductDescription({ markdown }: { markdown: string }) {
  const blocks = parseDescription(markdown);
  return (
    <div className="space-y-4 leading-relaxed text-coffee-800">
      {blocks.map((b, i) => {
        if (b.type === "h") {
          return (
            <h3 key={i} className="font-serif text-lg font-semibold text-coffee-900">
              <Inline text={b.text} />
            </h3>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {b.items.map((item, j) => (
                <li key={j}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            <Inline text={b.text} />
          </p>
        );
      })}
    </div>
  );
}
