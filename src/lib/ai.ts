/* "✨ Claude" features — run on the viewer's own Claude account through the artifact's `sample` capability. */
import { platform } from './platform';
import { getData } from './store';
import { addTopicsTo, applyStatus, applySubState, deleteSkill, editSkill, newSub, reorderSkills, updateRoadmap } from './actions';
import type { Status, SubState } from './db';
import type { TemplateTopic } from '../data/templates';

export interface GeneratedRoadmap { name: string; description: string; topics: TemplateTopic[] }
const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);

export async function toolsAvailable() {
  if (!platform.sample) return false;
  try { return !!(await platform.sample.limits())?.tools; } catch { return false; }
}

/* ---------- 1. Generate a whole roadmap ---------- */
export async function generateRoadmap(o: { goal: string; level: string; time: string; extra: string }, signal: AbortSignal): Promise<GeneratedRoadmap> {
  const prompt = `You design learning roadmaps for a personal learning-tracker app (similar to roadmap.sh).

Learner's goal: ${o.goal}
Current level: ${o.level}
Time available: ${o.time}
Extra wishes: ${o.extra || 'none'}

Reply with ONLY this JSON (no other text):
{"name": "2-4 word roadmap name", "description": "one sentence describing the goal", "topics": [{"title": "topic name", "description": "one short sentence", "subtopics": ["short subtopic", "..."], "resources": [{"title": "resource name", "url": "https://..."}]}]}

Rules:
- 6 to 12 topics, in the order the learner should study them, fitted to their level and time.
- 3 to 7 subtopics per topic, each 2-6 words, concrete and checkable.
- resources: 0 to 2 per topic. Only official documentation or very well-known, stable pages (for example docs.python.org, developer.mozilla.org, learn.microsoft.com, the tool's own official site). Never guess a URL; leave resources empty when unsure.`;
  const r: any = await platform.sample.json(prompt, { signal, cache: false });
  const topics: TemplateTopic[] = (Array.isArray(r?.topics) ? r.topics : []).slice(0, 20).map((t: any) => ({
    title: str(t?.title, 120) || 'Untitled topic',
    description: str(t?.description, 300),
    subs: (Array.isArray(t?.subtopics) ? t.subtopics : []).slice(0, 15).map((x: any) => str(x, 120)).filter(Boolean),
    links: (Array.isArray(t?.resources) ? t.resources : []).slice(0, 4)
      .map((x: any) => [str(x?.title, 120) || str(x?.url, 120), str(x?.url, 500)] as [string, string])
      .filter(([, u]: [string, string]) => /^https:\/\/[^\s]+$/i.test(u)),
  }));
  if (!topics.length) throw { code: 'invalid_json' };
  return { name: str(r?.name, 80) || o.goal.slice(0, 60), description: str(r?.description, 300), topics };
}

/* ---------- 2. Explain a subtopic (streams Markdown) ---------- */
export function explainSubtopic(o: { roadmap: string; topic: string; sub: string }, signal: AbortSignal, onText: (t: string) => void) {
  const prompt = `I'm learning "${o.topic}"${o.roadmap ? ` as part of my "${o.roadmap}" roadmap` : ''}. Teach me the subtopic "${o.sub}".

Write study notes in Markdown, under 250 words:
- A plain-language explanation (3-5 sentences).
- "### Key points" — 3-5 bullets.
- A tiny example (code block if it's a technical topic).
- "### Practice" — 2 short exercises.
No intro or sign-off.`;
  return platform.sample(prompt, { signal, onText: ({ text }: { text: string }) => onText(text), cache: false });
}

/* ---------- 3. Suggest subtopics for a topic ---------- */
export async function suggestSubtopics(o: { roadmap: string; topic: string; description: string; existing: string[] }, signal: AbortSignal): Promise<string[]> {
  const prompt = `A learner's roadmap "${o.roadmap || 'personal learning'}" has the topic "${o.topic}"${o.description ? ` (${o.description})` : ''}.
Existing subtopics: ${o.existing.length ? o.existing.join('; ') : 'none'}.
Suggest 4 to 6 NEW subtopics that are missing, in learning order, each 2-6 words. Reply with ONLY a JSON array of strings.`;
  const r: any = await platform.sample.json(prompt, { signal, modelTier: 'quick', cache: false });
  return (Array.isArray(r) ? r : []).map((x: any) => str(x, 120)).filter(Boolean).slice(0, 8);
}

/* ---------- 4. Edit a roadmap from an instruction (Claude uses page tools) ---------- */
export function roadmapSnapshot(roadmapId: string) {
  const d = getData(); const r = d.roadmaps.find(x => x.id === roadmapId);
  const topics = d.skills.filter(s => s.roadmapId === roadmapId).sort((a, b) => a.order - b.order);
  return {
    name: r?.name, description: r?.description,
    topics: topics.map((s, i) => ({ position: i + 1, id: s.id, title: s.title, status: s.status, description: s.description,
      subtopics: s.checklist.map(c => ({ id: c.id, text: c.text, state: c.state || 'pending' })) })),
  };
}

export async function editRoadmapWithClaude(
  roadmapId: string, instruction: string, signal: AbortSignal,
  hooks: { log: (msg: string) => void; confirm: (msg: string) => Promise<boolean>; onText: (t: string) => void },
) {
  const topicIds = () => getData().skills.filter(s => s.roadmapId === roadmapId).sort((a, b) => a.order - b.order).map(s => s.id);
  const findTopic = (id: unknown) => { const s = getData().skills.find(x => x.id === String(id) && x.roadmapId === roadmapId); if (!s) throw new Error('No topic with id ' + id + '. Call get_roadmap for current ids.'); return s; };
  const place = async (id: string, position: unknown) => {
    const ids = topicIds().filter(x => x !== id);
    const p = Math.max(1, Math.min(Number(position) || ids.length + 1, ids.length + 1));
    ids.splice(p - 1, 0, id); await reorderSkills(ids);
  };
  const STATUS: Status[] = ['todo', 'learning', 'done'];
  const SUB: Record<string, SubState> = { pending: '', '': '', learning: 'learning', done: 'done', skip: 'skip', skipped: 'skip' };

  const tools = [
    { name: 'get_roadmap', description: 'Returns the roadmap as it is now: name, description and topics in order, each with id, title, status (todo/learning/done) and subtopics (id, text, state pending/learning/done/skip).',
      execute: () => roadmapSnapshot(roadmapId) },
    { name: 'add_topic', description: 'Adds a topic (a main step) with optional subtopics. position is 1-based; omit to add at the end. Returns the new topic id.',
      inputSchema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, subtopics: { type: 'array', items: { type: 'string' } }, position: { type: 'number' } }, required: ['title'] },
      execute: async (i: any) => {
        const [s] = await addTopicsTo(roadmapId, [{ title: str(i.title, 120), description: str(i.description, 300), subs: (Array.isArray(i.subtopics) ? i.subtopics : []).map((x: any) => str(x, 120)).filter(Boolean) }], Date.now());
        if (i.position != null) await place(s.id, i.position);
        hooks.log(`Added topic “${s.title}”`); return { id: s.id };
      } },
    { name: 'add_subtopics', description: 'Appends subtopics to an existing topic.',
      inputSchema: { type: 'object', properties: { topic_id: { type: 'string' }, subtopics: { type: 'array', items: { type: 'string' } } }, required: ['topic_id', 'subtopics'] },
      execute: async (i: any) => {
        const s = findTopic(i.topic_id); const list = (Array.isArray(i.subtopics) ? i.subtopics : []).map((x: any) => str(x, 120)).filter(Boolean);
        await editSkill(s.id, x => { list.forEach((t: string) => x.checklist.push(newSub(t))); if (x.status === 'done' && list.length) { x.status = 'learning'; x.doneAt = ''; } });
        hooks.log(`Added ${list.length} subtopic${list.length === 1 ? '' : 's'} to “${s.title}”`); return 'ok';
      } },
    { name: 'update_topic', description: 'Changes a topic: title, description, and/or status (todo, learning, done).',
      inputSchema: { type: 'object', properties: { topic_id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', enum: STATUS } }, required: ['topic_id'] },
      execute: async (i: any) => {
        const s = findTopic(i.topic_id);
        await editSkill(s.id, x => { if (i.title) x.title = str(i.title, 120); if (i.description != null) x.description = str(i.description, 300); if (STATUS.includes(i.status)) applyStatus(x, i.status); });
        hooks.log(`Updated topic “${str(i.title, 120) || s.title}”`); return 'ok';
      } },
    { name: 'update_subtopic', description: 'Changes a subtopic: text, state (pending, learning, done, skip) and/or note (Markdown study notes; replaces the old note).',
      inputSchema: { type: 'object', properties: { topic_id: { type: 'string' }, subtopic_id: { type: 'string' }, text: { type: 'string' }, state: { type: 'string', enum: ['pending', 'learning', 'done', 'skip'] }, note: { type: 'string' } }, required: ['topic_id', 'subtopic_id'] },
      execute: async (i: any) => {
        const s = findTopic(i.topic_id); const c = s.checklist.find(x => x.id === String(i.subtopic_id)); if (!c) throw new Error('No such subtopic id.');
        await editSkill(s.id, x => { const y = x.checklist.find(z => z.id === c.id)!; if (i.text) y.text = str(i.text, 120); if (i.note != null) y.note = String(i.note).slice(0, 20000); if (i.state != null && String(i.state) in SUB) applySubState(x, y, SUB[String(i.state)]); });
        hooks.log(`Updated subtopic “${str(i.text, 120) || c.text}”`); return 'ok';
      } },
    { name: 'move_topic', description: 'Moves a topic to a new 1-based position in the roadmap order.',
      inputSchema: { type: 'object', properties: { topic_id: { type: 'string' }, position: { type: 'number' } }, required: ['topic_id', 'position'] },
      execute: async (i: any) => { const s = findTopic(i.topic_id); await place(s.id, i.position); hooks.log(`Moved “${s.title}” to position ${Number(i.position)}`); return 'ok'; } },
    { name: 'delete_topic', description: 'Deletes a topic with its subtopics, notes and files. The user is asked to confirm; returns whether it was deleted.',
      inputSchema: { type: 'object', properties: { topic_id: { type: 'string' } }, required: ['topic_id'] },
      execute: async (i: any) => {
        const s = findTopic(i.topic_id);
        if (!(await hooks.confirm(`Claude wants to delete the topic “${s.title}” with its subtopics, notes and files.`))) return 'The user declined. Do not delete it.';
        await deleteSkill(s.id); hooks.log(`Deleted topic “${s.title}”`); return 'deleted';
      } },
    { name: 'delete_subtopics', description: 'Removes subtopics from a topic. The user is asked to confirm; returns whether they were removed.',
      inputSchema: { type: 'object', properties: { topic_id: { type: 'string' }, subtopic_ids: { type: 'array', items: { type: 'string' } } }, required: ['topic_id', 'subtopic_ids'] },
      execute: async (i: any) => {
        const s = findTopic(i.topic_id); const ids = new Set((Array.isArray(i.subtopic_ids) ? i.subtopic_ids : []).map(String));
        const names = s.checklist.filter(c => ids.has(c.id)).map(c => c.text); if (!names.length) return 'No matching subtopics.';
        if (!(await hooks.confirm(`Claude wants to remove ${names.length} subtopic${names.length > 1 ? 's' : ''} from “${s.title}”: ${names.join(', ')}.`))) return 'The user declined. Do not remove them.';
        await editSkill(s.id, x => { x.checklist = x.checklist.filter(c => !ids.has(c.id)); });
        hooks.log(`Removed ${names.length} subtopic${names.length > 1 ? 's' : ''} from “${s.title}”`); return 'removed';
      } },
    { name: 'update_roadmap', description: 'Renames the roadmap and/or changes its description.',
      inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } },
      execute: async (i: any) => { await updateRoadmap(roadmapId, { ...(i.name ? { name: str(i.name, 80) } : {}), ...(i.description != null ? { description: str(i.description, 300) } : {}) }); hooks.log('Updated roadmap details'); return 'ok'; } },
  ];
  const prompt = `You are helping a learner edit their learning roadmap in a tracker app. Use the tools to make the changes they ask for, then reply with 1-3 short sentences saying what you changed. Keep topic and subtopic names short (2-6 words). Only delete things when the learner clearly asks.

Current roadmap (JSON):
${JSON.stringify(roadmapSnapshot(roadmapId)).slice(0, 60000)}

Learner's request: ${instruction}`;
  return platform.sample(prompt, { signal, tools, onText: ({ text }: { text: string }) => hooks.onText(text) });
}

