import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Trash2, Upload } from 'lucide-react';
import { useData, useDialog, useToast } from '../components/providers';
import { PageHead, Seg } from '../components/ui';
import { applyTheme, getTheme, type ThemePref } from '../App';
import { exportBackup, importBackup, readBackup, wipeAll } from '../lib/actions';
import { fmtSize, pickFiles } from '../lib/utils';
import { isCloud, isSupabase, platform } from '../lib/platform';
import { sbUserId } from '../lib/store';
import { Copy, LogOut } from 'lucide-react';

function Sec({ title, desc, children, danger }: { title: string; desc: ReactNode; children?: ReactNode; danger?: boolean }) {
  return <section className="card mb-3 px-5 py-4"><h2 className={danger ? 'mb-1 font-semibold text-danger' : 'mb-1 font-semibold'}>{title}</h2><div className="mb-3 text-[13px] text-ink2">{desc}</div>{children}</section>;
}

export default function SettingsPage() {
  const { roadmaps, skills, notes, files } = useData(); const dlg = useDialog(); const toast = useToast(); const nav = useNavigate();
  const [theme, setTheme] = useState<ThemePref>(getTheme());
  const [storage, setStorage] = useState('Checking…');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (isCloud()) return;
    (async () => {
      try {
        const est = await navigator.storage?.estimate?.(); const persisted = await navigator.storage?.persisted?.();
        setStorage(`${est ? `Using ${fmtSize(est.usage || 0)}${est.quota ? ` of about ${fmtSize(est.quota)} available` : ''}. ` : ''}${persisted ? 'Storage is persistent, so the browser won’t clear it automatically.' : 'Storage is not marked persistent, so keep regular backups.'}`);
      } catch { setStorage('Storage info unavailable.'); }
    })();
  }, [files.length]);
  const counts = `${roadmaps.length} roadmaps · ${skills.length} topics · ${notes.length} notes · ${files.length} files`;
  return (
    <div className="mx-auto max-w-[760px] px-4 pb-20 pt-6 sm:px-7 sm:pt-8">
      <PageHead title="Settings" />
      {isCloud()
        ? <Sec title="Your data" desc={<>Everything is saved in Claude with this app, so it’s the same on every device where you open it. In any Claude chat you can ask Claude to create roadmaps, add topics, update progress or write notes here, and the changes show up straight away.</>}><span className="text-xs text-muted">{counts}</span></Sec>
        : <>
          {isSupabase() && <AccountSections />}
          <Sec title="Appearance" desc="Choose light, dark, or follow your system.">
            <Seg label="Theme" value={theme} onChange={t => { setTheme(t); applyTheme(t); }} options={[{ key: 'system', label: 'System' }, { key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]} />
          </Sec>
          {isSupabase() ? <Sec title="Your data" desc="Saved in your Supabase database and synced to every device where you sign in."><span className="text-xs text-muted">{counts}</span></Sec>
            : <Sec title="Storage" desc={storage}><span className="text-xs text-muted">{counts}</span></Sec>}
        </>}
      <Sec title="Backup & restore" desc={isCloud() || isSupabase() ? 'Download a copy of everything (notes and attachments included), or bring in a backup from another SkillTrack (offline file or the Claude version).' : 'Your data is saved in this browser only. Export a backup now and then; it includes notes and attachments. Import it in another browser, or in SkillTrack inside Claude, to continue there.'}>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" disabled={!!busy} onClick={async () => { setBusy('Preparing backup…'); const err = await exportBackup().catch((e: any) => 'Export failed: ' + (e?.message || e)); setBusy(''); toast(err || 'Backup downloaded'); }}><Download size={15} /> Export backup</button>
          <button className="btn" disabled={!!busy} onClick={() => pickFiles(async fl => {
            try {
              const d = await readBackup(fl[0]);
              if (!(await dlg.confirm(<>Import <b>{d.roadmaps?.length || 0}</b> roadmaps, <b>{d.skills?.length || 0}</b> topics, <b>{d.notes?.length || 0}</b> notes and <b>{d.files?.length || 0}</b> files? Your current data is kept; items with the same ID are replaced.</>, { title: 'Import backup', ok: 'Import', danger: false }))) return;
              setBusy('Importing…'); const errs = await importBackup(d); setBusy('');
              toast(errs.length ? `Imported, but ${errs.length} file${errs.length > 1 ? 's' : ''} couldn’t be added` : 'Backup imported');
            } catch (e: any) { setBusy(''); toast(e?.message?.includes('JSON') ? 'That is not a valid backup file' : (e?.message || 'Import failed')); }
          }, '.json,application/json', false)}><Upload size={15} /> Import backup</button>
          {busy && <span className="text-[13px] text-muted">{busy}</span>}
        </div>
      </Sec>
      <Sec danger title="Danger zone" desc="Delete every roadmap, topic, note and file. Export a backup first.">
        <button className="btn btn-danger" disabled={!!busy} onClick={async () => {
          if (!(await dlg.confirm('Every roadmap, topic, note and file will be permanently deleted. This cannot be undone.', { title: 'Delete all data?', ok: 'Delete everything' }))) return;
          setBusy('Deleting…'); await wipeAll(); setBusy(''); nav('/'); toast('All data deleted');
        }}><Trash2 size={15} /> Delete all data</button>
      </Sec>
    </div>
  );
}

function CopyField({ label, value, id }: { label: string; value: string; id: string }) {
  const toast = useToast();
  return (
    <label className="mb-2.5 flex flex-col gap-1">
      <span className="eyebrow">{label}</span>
      <span className="flex gap-1.5">
        <input id={id} readOnly className="input font-mono text-[12.5px]" value={value} onFocus={e => e.target.select()} />
        <button type="button" className="btn shrink-0" onClick={async () => { try { await navigator.clipboard.writeText(value); toast('Copied'); } catch { (document.getElementById(id) as HTMLInputElement)?.select(); } }}><Copy size={14} /> Copy</button>
      </span>
    </label>
  );
}

function AccountSections() {
  const [email, setEmail] = useState('');
  const [secret] = useState(() => { const a = new Uint8Array(24); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); });
  useEffect(() => { platform.sb?.auth.getUser().then(({ data }) => setEmail(data.user?.email || '')); }, []);
  const site = location.origin;
  return <>
    <Sec title="Account" desc={<>Signed in as <b>{email || '…'}</b>.</>}>
      <button className="btn" onClick={() => platform.sb?.auth.signOut()}><LogOut size={15} /> Sign out</button>
    </Sec>
    <Sec title="Connect Claude" desc={<>Let Claude create and edit your roadmaps from any chat. No API key needed.</>}>
      <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-[13px] text-ink2">
        <li>In <b>Vercel → your project → Settings → Environment Variables</b>, add <code className="rounded bg-surface2 px-1">MCP_SECRET</code> with the value below (or any long random text), and <code className="rounded bg-surface2 px-1">OWNER_USER_ID</code> with your user ID. Then redeploy.</li>
        <li>In <b>Claude → Settings → Connectors → Add custom connector</b>, name it <b>SkillTrack</b> and paste the connector URL below (with your secret at the end).</li>
        <li>In a chat, try: “Create a Docker roadmap for a beginner in my SkillTrack.”</li>
      </ol>
      <CopyField id="cf-secret" label="Suggested MCP_SECRET (new each time you open this page)" value={secret} />
      <CopyField id="cf-uid" label="Your user ID (OWNER_USER_ID)" value={sbUserId()} />
      <CopyField id="cf-url" label="Connector URL (replace YOUR_SECRET with your MCP_SECRET)" value={`${site}/mcp/YOUR_SECRET`} />
    </Sec>
  </>;
}
