import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import type { Roadmap, Skill } from '../lib/db';
import { ckStats, cx } from '../lib/utils';
import { setSkillStatus, setSubState } from '../lib/actions';

interface Props { roadmap: Roadmap; skills: Skill[]; onOpen: (sid: string, cid?: string) => void; onAdd: () => void }

/**
 * roadmap.sh-style flowchart: main topics on a vertical spine, subtopics branching left and right.
 * Boxes are laid out with CSS grid; connector lines are measured from the DOM and drawn in an SVG overlay.
 */
export function RoadmapMap({ roadmap, skills, onOpen, onAdd }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [lines, setLines] = useState({ spine: '', branch: '', w: 0, h: 0 });

  const draw = useCallback(() => {
    const el = wrap.current; if (!el) return;
    const nar = el.clientWidth < 700;
    setNarrow(nar);
    if (nar) { setLines({ spine: '', branch: '', w: 0, h: 0 }); return; }
    const box = el.getBoundingClientRect();
    const rel = (n: Element) => { const r = n.getBoundingClientRect(); return { l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, b: r.bottom - box.top, cx: (r.left + r.right) / 2 - box.left, cy: (r.top + r.bottom) / 2 - box.top }; };
    const sp = [...el.querySelectorAll('[data-spine]')].map(rel);
    let spine = '';
    for (let i = 0; i < sp.length - 1; i++) spine += `M${sp[i].cx},${sp[i].b}L${sp[i + 1].cx},${sp[i + 1].t}`;
    let branch = '';
    el.querySelectorAll('[data-row]').forEach(row => {
      const m = row.querySelector('[data-main]'); if (!m) return; const a = rel(m);
      const curve = (x1: number, y1: number, x2: number, y2: number) => { const mx = (x1 + x2) / 2; return `M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`; };
      row.querySelectorAll('[data-side="left"] [data-sub]').forEach(s => { const c = rel(s); branch += curve(a.l, a.cy, c.r, c.cy); });
      row.querySelectorAll('[data-side="right"] [data-sub]').forEach(s => { const c = rel(s); branch += curve(a.r, a.cy, c.l, c.cy); });
    });
    setLines({ spine, branch, w: el.scrollWidth, h: el.scrollHeight });
  }, []);

  useLayoutEffect(() => { draw(); }, [draw, skills, roadmap, narrow]);
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [draw]);

  const toggleMain = (s: Skill) => setSkillStatus(s.id, s.status === 'done' ? 'todo' : 'done');

  return (
    <div ref={wrap} className="relative pb-4" style={{ ['--rc' as any]: roadmap.color }}>
      {!narrow && (
        <svg className="pointer-events-none absolute left-0 top-0" width={lines.w} height={lines.h} aria-hidden="true">
          <path d={lines.branch} fill="none" stroke="var(--border-strong)" strokeWidth={1.5} strokeDasharray="4 4" />
          <path d={lines.spine} fill="none" stroke={roadmap.color} strokeWidth={3} strokeLinecap="round" />
        </svg>
      )}

      <div className="relative mb-10 flex justify-center">
        <div data-spine className="relative z-10 rounded-xl border-2 border-ink bg-surface px-6 py-3 text-center text-lg font-bold shadow-soft">{roadmap.name}</div>
      </div>

      {skills.map(s => {
        const left = s.checklist.filter((_, i) => i % 2 === 1);
        const right = s.checklist.filter((_, i) => i % 2 === 0);
        const { n, d } = ckStats(s);
        const sub = (c: Skill['checklist'][number]) => (
          <button key={c.id} data-sub onClick={() => onOpen(s.id, c.id)}
            onContextMenu={e => { e.preventDefault(); setSubState(s.id, c.id, c.state === 'done' ? '' : 'done'); }}
            title={c.text + ' — click for details, right-click to mark done'}
            className={cx('rm-node sub st-' + (c.state || 'todo'), 'relative z-10 flex w-full max-w-[230px] items-center gap-2 rounded-lg border-[1.5px] border-line2 bg-surface px-3 py-2 text-left text-[13px] leading-snug transition hover:-translate-y-px hover:shadow-soft')}>
            {c.state === 'done' && <Check size={14} className="shrink-0 text-done" strokeWidth={3} />}
            {c.state === 'learning' && <span className="sdot learning" />}
            <span className="rm-label min-w-0">{c.text}</span>
          </button>
        );
        return (
          <div key={s.id} data-row className={cx('relative mb-10', narrow ? 'flex flex-col gap-2' : 'grid grid-cols-[1fr_minmax(170px,230px)_1fr] items-center gap-x-10 xl:gap-x-14')}>
            {!narrow && <div data-side="left" className="flex flex-col items-end gap-2">{left.map(sub)}</div>}
            <div className="flex justify-center">
              <button data-spine data-main onClick={() => onOpen(s.id)}
                onContextMenu={e => { e.preventDefault(); toggleMain(s); }}
                title={s.title + ' — click for details, right-click to mark done'}
                className={cx('rm-node main st-' + s.status, 'relative z-10 flex w-full flex-col items-center rounded-xl border-2 px-3 py-2.5 text-center font-semibold leading-snug shadow-soft transition hover:-translate-y-px')}>
                <span className="rm-label inline-flex items-center gap-1.5">{s.status === 'done' && <Check size={15} className="text-done" strokeWidth={3} />}{s.title}</span>
                {n > 0 && <span className="mt-0.5 text-[11px] font-medium text-ink2 no-underline">{d}/{n}</span>}
              </button>
            </div>
            <div data-side="right" className={cx('flex flex-col gap-2', narrow ? cx('order-2 ml-3 items-stretch pl-4', s.checklist.length > 0 && 'border-l-2 border-dashed border-line2') : 'items-start')}>
              {(narrow ? s.checklist : right).map(sub)}
            </div>
          </div>
        );
      })}

      <div className="relative flex justify-center">
        <button data-spine onClick={onAdd} className="relative z-10 inline-flex items-center gap-1.5 rounded-xl border-2 border-dashed border-line2 bg-bg px-4 py-2 font-medium text-muted hover:border-accent hover:text-accent">
          <Plus size={16} /> Add topic
        </button>
      </div>
    </div>
  );
}
