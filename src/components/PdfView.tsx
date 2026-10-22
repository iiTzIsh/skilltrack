import { useEffect, useRef, useState, type ReactNode } from 'react';

// Inside Claude the built-in PDF viewer can't run in the app's frame, so PDFs are drawn with pdf.js.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('load failed')); document.head.append(s);
  });
}
let loading: Promise<any> | null = null;
function loadPdfJs() {
  // The worker script defines window.pdfjsWorker, so pdf.js runs on the main thread (no Worker needed).
  loading ??= loadScript(PDFJS + 'pdf.worker.min.js').then(() => loadScript(PDFJS + 'pdf.min.js')).then(() => (window as any).pdfjsLib);
  return loading;
}

export function PdfView({ blob, fallback }: { blob: Blob; fallback: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [pages, setPages] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lib = await loadPdfJs();
        const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
        if (cancelled) return;
        setPages(pdf.numPages); setState('ok');
        const width = Math.min((box.current?.clientWidth || 800) - 32, 900);
        for (let i = 1; i <= Math.min(pdf.numPages, 300); i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width; const dpr = window.devicePixelRatio || 1;
          const vp = page.getViewport({ scale: scale * dpr });
          const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
          c.style.width = vp.width / dpr + 'px'; c.style.height = vp.height / dpr + 'px';
          c.className = 'mx-auto mb-4 block bg-white shadow-soft';
          box.current?.append(c);
          await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
        }
      } catch { if (!cancelled) setState('error'); }
    })();
    return () => { cancelled = true; };
  }, [blob]);
  if (state === 'error') return <>{fallback}</>;
  return (
    <div className="w-full">
      {state === 'loading' && <div className="p-10 text-center text-muted">Loading PDF…</div>}
      {state === 'ok' && <div className="px-4 pt-3 text-center text-xs text-muted">{pages} page{pages > 1 ? 's' : ''}</div>}
      <div ref={box} className="w-full p-4" data-pdf-pages />
    </div>
  );
}
