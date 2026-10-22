import { useEffect, useState } from 'react';
import { HashRouter, MemoryRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Compass, Columns3, FileText, LayoutDashboard, Menu, Moon, Paperclip, Plus, Search, SlidersHorizontal, Sun } from 'lucide-react';
import { DataProvider, DialogProvider, ToastProvider, useData, useDialog } from './components/providers';
import { OverlayProvider, useOverlays } from './components/overlays';
import { createRoadmap } from './lib/actions';
import { cx, lsGet, lsSet, roadmapStats } from './lib/utils';
import { isCloud } from './lib/platform';
import { AuthGate } from './components/Auth';
import Dashboard from './pages/Dashboard';
import Board from './pages/Board';
import RoadmapPage from './pages/RoadmapPage';
import SkillPage from './pages/SkillPage';
import NotesPage from './pages/NotesPage';
import FilesPage from './pages/FilesPage';
import ExplorePage from './pages/ExplorePage';
import SettingsPage from './pages/SettingsPage';

/* ---------- theme ---------- */
// Inside Claude the viewer's own theme wins (it sets data-theme on <html>); offline, the app keeps its own choice.
export type ThemePref = 'system' | 'light' | 'dark';
export function getTheme(): ThemePref { return (lsGet('st-theme') as ThemePref) || 'system'; }
export function applyTheme(t: ThemePref) {
  lsSet('st-theme', t);
  if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
}
const computeDark = () => { const t = document.documentElement.getAttribute('data-theme'); return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); };
function useIsDark() {
  const [d, setD] = useState(computeDark());
  useEffect(() => {
    const h = () => setD(computeDark());
    const mo = new MutationObserver(h); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener?.('change', h);
    return () => { mo.disconnect(); mq.removeEventListener?.('change', h); };
  }, []);
  return d;
}

function Logo() {
  return <span className="relative inline-grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-accent">
    <svg viewBox="0 0 32 32" className="h-[22px] w-[22px]"><path d="M9 21l5-5 4 4 6-8" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>;
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { roadmaps, skills, notes, files } = useData(); const ov = useOverlays(); const dlg = useDialog(); const nav = useNavigate();
  const isDark = useIsDark();
  const item = ({ isActive }: { isActive: boolean }) => cx('flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] transition-colors', isActive ? 'bg-accentsoft font-medium text-accent' : 'text-ink2 hover:bg-surface2 hover:text-ink');
  const Count = ({ n }: { n: number }) => n ? <span className="ml-auto text-[11px] tabular-nums text-muted">{n}</span> : null;
  return (
    <div className="flex h-full flex-col gap-0.5 overflow-y-auto px-2.5 py-3.5" onClick={e => { if ((e.target as HTMLElement).closest('a')) onNavigate(); }}>
      <div className="flex items-center gap-2.5 px-2 pb-3 pt-1 text-[15px] font-semibold"><Logo />SkillTrack</div>
      <button onClick={() => { onNavigate(); ov.openSearch(); }} className="mb-2.5 flex w-full items-center gap-2 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-muted hover:border-line2">
        <Search size={15} /><span className="flex-1 text-left">Search</span><kbd className="rounded border border-line bg-surface px-1.5 font-mono text-[11px]">/</kbd>
      </button>
      <NavLink end to="/" className={item}><LayoutDashboard size={16} />Dashboard</NavLink>
      <NavLink to="/board" className={item}><Columns3 size={16} />Board<Count n={skills.length} /></NavLink>
      <NavLink to="/notes" className={item}><FileText size={16} />Notes<Count n={notes.length} /></NavLink>
      <NavLink to="/files" className={item}><Paperclip size={16} />Files<Count n={files.length} /></NavLink>
      <NavLink to="/explore" className={item}><Compass size={16} />Explore roadmaps</NavLink>
      <div className="flex items-center justify-between px-2.5 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span>My roadmaps</span>
        <button className="icon-btn h-6 w-6" title="New roadmap" aria-label="New roadmap" onClick={async () => { const n = await dlg.prompt('New roadmap', { placeholder: 'e.g. Data Science, Cloud, DevOps' }); if (n) { const r = await createRoadmap(n); onNavigate(); nav('/roadmaps/' + r.id); } }}><Plus size={15} /></button>
      </div>
      {roadmaps.length ? roadmaps.map(r => (
        <NavLink key={r.id} to={'/roadmaps/' + r.id} className={item}>
          <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: r.color }} /><span className="min-w-0 flex-1 truncate">{r.name}</span>
          <span className="text-[11px] tabular-nums text-muted">{roadmapStats(r, skills).pct}%</span>
        </NavLink>
      )) : <p className="px-2.5 text-xs text-muted">No roadmaps yet</p>}
      <div className="mt-auto flex items-center gap-1 border-t border-line pt-3">
        <NavLink to="/settings" className={p => cx(item(p), 'flex-1')}><SlidersHorizontal size={16} />Settings</NavLink>
        {!isCloud() && <button className="icon-btn" title="Toggle dark mode" aria-label="Toggle dark mode" onClick={() => applyTheme(isDark ? 'light' : 'dark')}>{isDark ? <Sun size={16} /> : <Moon size={16} />}</button>}
      </div>
    </div>
  );
}

function Shell() {
  const [open, setOpen] = useState(false); const loc = useLocation(); const ov = useOverlays();
  useEffect(() => { document.getElementById('main')?.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <div className="grid h-full grid-rows-[auto_1fr] md:grid-cols-[240px_1fr] md:grid-rows-1">
      <header className="flex items-center justify-between border-b border-line bg-surface px-2.5 py-2 md:hidden">
        <button className="icon-btn" aria-label="Menu" onClick={() => setOpen(true)}><Menu size={18} /></button>
        <span className="flex items-center gap-2 font-semibold"><Logo />SkillTrack</span>
        <button className="icon-btn" aria-label="Search" onClick={() => ov.openSearch()}><Search size={18} /></button>
      </header>
      <aside className={cx('fixed inset-y-0 left-0 z-30 w-[270px] border-r border-line bg-surface transition-transform md:static md:w-auto md:translate-x-0', open ? 'translate-x-0 shadow-pop' : '-translate-x-full')}>
        <Sidebar onNavigate={() => setOpen(false)} />
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-overlay md:hidden" onClick={() => setOpen(false)} />}
      <main id="main" className="min-w-0 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/board" element={<Board />} />
          <Route path="/roadmaps/:id" element={<RoadmapPage />} />
          <Route path="/skills/:id" element={<SkillPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  );
}

const Router = ({ children }: { children: React.ReactNode }) => isCloud() ? <MemoryRouter>{children}</MemoryRouter> : <HashRouter>{children}</HashRouter>;

export default function App() {
  // stop the browser from opening files dropped outside a drop zone
  useEffect(() => {
    const stop = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    window.addEventListener('dragover', stop); window.addEventListener('drop', stop);
    return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop); };
  }, []);
  return (
    <ToastProvider>
      <AuthGate>
      <DataProvider>
        <DialogProvider>
          <Router>
            <OverlayProvider>
              <Shell />
            </OverlayProvider>
          </Router>
        </DialogProvider>
      </DataProvider>
      </AuthGate>
    </ToastProvider>
  );
}

