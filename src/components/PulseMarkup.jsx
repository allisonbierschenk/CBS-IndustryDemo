// Renders Tableau Pulse brief markup safely (no dangerouslySetInnerHTML):
//  • headings (## / ###), bullets (- ), paragraphs, blank-line spacers
//  • <span data-type="number|metric|entity|dimension|insight-type-keyword">, <llm_value>, **bold**
//  • citation tokens [[1]](…) and [[inline-viz-citation]](…) are stripped
import { Fragment } from 'react';

const CITATIONS = /\[\[(\d+)\]\]\(([^)]*)\)|\[\[inline-viz-citation(?:-embedded)?\]\]\(([^)]*)\)/g;
const INLINE = /<span\s+data-type="([^"]*)"[^>]*>(.*?)<\/span>|<llm_value[^>]*>(.*?)<\/llm_value>|\*\*(.+?)\*\*/g;
const stripTags = (s) => s.replace(/<[^>]+>/g, '');

export const direction = (text) =>
  /\b(down|declin|decreas|below|drop|fell|lower|worse)/i.test(text) ? 'down' : /\b(up|increas|above|rose|grew|higher|improv)/i.test(text) ? 'up' : 'flat';

export function renderInline(text, keyPrefix = 'i') {
  const out = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(stripTags(text.slice(last, m.index)));
    const [, type, spanText, llmValue, bold] = m;
    const key = `${keyPrefix}-${n++}`;
    if (bold !== undefined) out.push(<strong key={key} className="pm-bold">{stripTags(bold)}</strong>);
    else if (llmValue !== undefined) out.push(<strong key={key} className="pm-entity">{stripTags(llmValue)}</strong>);
    else if (type === 'number') out.push(<strong key={key} className="pm-number">{stripTags(spanText)}</strong>);
    else if (type === 'metric' || type === 'entity' || type === 'dimension') out.push(<strong key={key} className="pm-entity">{stripTags(spanText)}</strong>);
    else if (type === 'insight-type-keyword') out.push(<strong key={key} className={`pm-keyword is-${direction(spanText)}`}>{stripTags(spanText)}</strong>);
    else out.push(stripTags(spanText));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(stripTags(text.slice(last)));
  return out;
}

export default function PulseMarkup({ text }) {
  const clean = String(text || '').replace(CITATIONS, '').replace(/[ \t]+$/gm, '');
  return (
    <div className="pm">
      {clean.split('\n').map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="pm-gap" />;
        if (/^#{2,4}\s/.test(t)) return <h4 key={i} className="pm-head">{renderInline(t.replace(/^#{2,4}\s+/, ''), `h${i}`)}</h4>;
        if (/^[-*]\s/.test(t))
          return (
            <div key={i} className="pm-bullet">
              <span aria-hidden="true">›</span>
              <span>{renderInline(t.replace(/^[-*]\s+/, ''), `b${i}`)}</span>
            </div>
          );
        return (
          <p key={i} className="pm-line">
            {renderInline(t, `p${i}`).map((part, j) => (
              <Fragment key={j}>{part}</Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
