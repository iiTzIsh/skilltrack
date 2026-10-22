import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { COLORS, applyStatus, applySubState, normSkill, now, progress, uid, type DocStore, type Link, type Note, type Roadmap, type Skill, type SubState, type FileMeta } from './model.js';

const INSTRUCTIONS = `SkillTrack is the user's personal learning tracker. A roadmap is an ordered list of topics; each topic has subtopics.
Topic status: todo | learning | done. Subtopic state: pending | learning | done | skip.
Call list_roadmaps or get_roadmap first to get ids. Keep topic and subtopic names short (2-6 words).
When building a roadmap, order topics the way the learner should study them, and only add resource links you are confident exist (official docs, well-known sites).
Changes appear in the user's SkillTrack app straight away.`;

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 1) }] });
const fail = (msg: string) => ({ content: [{ type: 'text' as const, text: msg }], isError: true });
const SUB_IN: Record<string, SubState> = { pending: '', learning: 'learning', done: 'done', skip: 'skip' };
const subOut = (s: SubState) => s || 'pending';
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
const links = (list?: { title?: string; url: string }[]): Link[] =>
  (list || []).filter(l => /^https?:\/\/\S+$/i.test(l.url)).map(l => ({ id: uid(), title: clip(l.title || l.url, 120), url: l.url }));

const resourceSchema = z.object({ title: z.string().optional(), url: z.string().describe('https:// link') });
const topicSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  subtopics: z.array(z.string()).optional(),
  resources: z.array(resourceSchema).optional(),
});

export function buildServer(store: DocStore) {
  const server = new McpServer({ name: 'skilltrack', version: '1.0.0' }, { instructions: INSTRUCTIONS });

  const load = async () => {
    const [roadmaps, skills, notes] = await Promise.all([store.all<Roadmap>('roadmaps'), store.all<any>('skills'), store.all<Note>('notes')]);
    return { roadmaps: roadmaps.sort((a, b) => a.order - b.order), skills: skills.map(normSkill), notes };
  };
  const topicsOf = (skills: Skill[], roadmapId: string) => skills.filter(s => s.roadmapId === roadmapId).sort((a, b) => a.order - b.order);
  const stats = (r: Roadmap, skills: Skill[]) => {
    const t = topicsOf(skills, r.id);
    return { topics: t.length, topics_done: t.filter(s => s.status === 'done').length, percent: t.length ? Math.round(t.reduce((a, s) => a + progress(s), 0) / t.length) : 0 };
  };
  const topicView = (s: Skill, i?: number) => ({
    id: s.id, ...(i != null ? { position: i + 1 } : {}), title: s.title, status: s.status, progress_percent: progress(s),
    description: s.description || undefined, priority: s.priority, target_date: s.target || undefined, tags: s.tags.length ? s.tags : undefined,
    resources: s.links.length ? s.links.map(l => ({ title: l.title, url: l.url })) : undefined,
    has_notes: !!s.notes.trim() || undefined,
    subtopics: s.checklist.map(c => ({ id: c.id, text: c.text, state: subOut(c.state), ...(c.note.trim() ? { has_note: true } : {}) })),
  });
  const getSkill = async (id: string) => (await store.all<any>('skills')).map(normSkill).find(s => s.id === id);
  const saveSkill = (s: Skill) => { s.updatedAt = now(); return store.put('skills', s); };
  const reorder = async (roadmapId: string, ids: string[]) => {
    const all = (await store.all<any>('skills')).map(normSkill);
    for (let k = 0; k < ids.length; k++) { const s = all.find(x => x.id === ids[k] && x.roadmapId === roadmapId); if (s && s.order !== k) { s.order = k; await saveSkill(s); } }
  };
  const newTopic = (roadmapId: string, t: z.infer<typeof topicSchema>, order: number): Skill => normSkill({
    id: uid(), roadmapId, title: clip(t.title, 120) || 'Untitled', description: clip(t.description, 500), order,
    checklist: (t.subtopics || []).map(x => clip(x, 120)).filter(Boolean).map(text => ({ id: uid(), text, state: '', note: '', links: [] })),
    links: links(t.resources),
  });
  const deleteFilesOf = async (parent: string) => {
    for (const f of (await store.all<FileMeta>('files')).filter(f => f.parent === parent)) { await store.delBlob(f.id); await store.del('files', f.id); }
  };

  /* ---------------- read ---------------- */
  server.registerTool('list_roadmaps', {
    title: 'List roadmaps', description: 'Lists all roadmaps with id, name, description and progress.',
    annotations: { readOnlyHint: true },
  }, async () => {
    const d = await load();
    return json(d.roadmaps.map(r => ({ id: r.id, name: r.name, description: r.description || undefined, ...stats(r, d.skills) })));
  });

  server.registerTool('get_roadmap', {
    title: 'Get roadmap', description: 'Returns one roadmap with its topics in order, each with subtopics (ids, text, state), status, description and resources.',
    inputSchema: { roadmap_id: z.string() }, annotations: { readOnlyHint: true },
  }, async ({ roadmap_id }) => {
    const d = await load(); const r = d.roadmaps.find(x => x.id === roadmap_id);
    if (!r) return fail('No roadmap with that id. Call list_roadmaps.');
    return json({ id: r.id, name: r.name, description: r.description, color: r.color, ...stats(r, d.skills), topics: topicsOf(d.skills, r.id).map(topicView) });
  });

  server.registerTool('get_topic_details', {
    title: 'Get topic details', description: 'Returns one topic in full, including its Markdown notes and each subtopic\'s notes and resources.',
    inputSchema: { topic_id: z.string() }, annotations: { readOnlyHint: true },
  }, async ({ topic_id }) => {
    const s = await getSkill(topic_id); if (!s) return fail('No topic with that id.');
    return json({ ...topicView(s), notes: s.notes, subtopics: s.checklist.map(c => ({ id: c.id, text: c.text, state: subOut(c.state), note: c.note, resources: c.links.map(l => ({ title: l.title, url: l.url })) })) });
  });

  server.registerTool('get_progress', {
    title: 'Get learning progress', description: 'Summary of the learner\'s progress: per-roadmap percent, topics in progress, up next, overdue / due in 14 days, recently learned, and pinned notes.',
    annotations: { readOnlyHint: true },
  }, async () => {
    const d = await load(); const today = new Date().toISOString().slice(0, 10);
    const name = (s: Skill) => d.roadmaps.find(r => r.id === s.roadmapId)?.name || '(no roadmap)';
    const brief = (s: Skill) => ({ id: s.id, title: s.title, roadmap: name(s), progress_percent: progress(s), target_date: s.target || undefined });
    const soon = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    const rank = { high: 0, medium: 1, low: 2 } as const;
    return json({
      today,
      roadmaps: d.roadmaps.map(r => ({ id: r.id, name: r.name, ...stats(r, d.skills) })),
      counts: { to_learn: d.skills.filter(s => s.status === 'todo').length, learning: d.skills.filter(s => s.status === 'learning').length, learned: d.skills.filter(s => s.status === 'done').length },
      learning_now: d.skills.filter(s => s.status === 'learning').map(brief),
      up_next: d.skills.filter(s => s.status === 'todo').sort((a, b) => rank[a.priority] - rank[b.priority] || a.order - b.order).slice(0, 8).map(brief),
      overdue: d.skills.filter(s => s.status !== 'done' && s.target && s.target < today).map(brief),
      due_soon: d.skills.filter(s => s.status !== 'done' && s.target && s.target >= today && s.target <= soon).map(brief),
      recently_learned: d.skills.filter(s => s.status === 'done').sort((a, b) => b.doneAt.localeCompare(a.doneAt)).slice(0, 8).map(s => ({ ...brief(s), learned_on: s.doneAt.slice(0, 10) })),
      pinned_notes: d.notes.filter(n => n.pinned).map(n => ({ id: n.id, title: n.title })),
    });
  });

  server.registerTool('search', {
    title: 'Search', description: 'Searches roadmaps, topics, subtopics and notes for a word or phrase.',
    inputSchema: { query: z.string() }, annotations: { readOnlyHint: true },
  }, async ({ query }) => {
    const q = query.toLowerCase(); const d = await load(); const has = (...x: string[]) => x.join(' ').toLowerCase().includes(q);
    return json({
      roadmaps: d.roadmaps.filter(r => has(r.name, r.description)).map(r => ({ id: r.id, name: r.name })),
      topics: d.skills.filter(s => has(s.title, s.description, s.notes, s.tags.join(' '))).map(s => ({ id: s.id, title: s.title, roadmap_id: s.roadmapId })),
      subtopics: d.skills.flatMap(s => s.checklist.filter(c => has(c.text, c.note)).map(c => ({ topic_id: s.id, topic: s.title, subtopic_id: c.id, text: c.text, state: subOut(c.state) }))),
      notes: d.notes.filter(n => has(n.title, n.body)).map(n => ({ id: n.id, title: n.title })),
    });
  });

  /* ---------------- roadmaps ---------------- */
  server.registerTool('create_roadmap', {
    title: 'Create roadmap', description: 'Creates a roadmap, optionally with its topics (in study order), subtopics and resources. Returns the new ids.',
    inputSchema: { name: z.string(), description: z.string().optional(), color: z.string().optional().describe('hex color, e.g. #6366f1'), topics: z.array(topicSchema).optional() },
  }, async ({ name, description, color, topics }) => {
    const existing = await store.all<Roadmap>('roadmaps'); const t = now();
    const r: Roadmap = { id: uid(), name: clip(name, 80) || 'Untitled roadmap', description: clip(description, 500), color: /^#[0-9a-f]{6}$/i.test(color || '') ? color! : COLORS[existing.length % COLORS.length], order: Date.now(), createdAt: t, updatedAt: t };
    await store.put('roadmaps', r);
    const created: Skill[] = [];
    for (const [i, tp] of (topics || []).entries()) { const s = newTopic(r.id, tp, i); await store.put('skills', s); created.push(s); }
    return json({ roadmap_id: r.id, name: r.name, topics: created.map(s => ({ id: s.id, title: s.title, subtopics: s.checklist.length })) });
  });

  server.registerTool('update_roadmap', {
    title: 'Update roadmap', description: 'Renames a roadmap or changes its description or color.',
    inputSchema: { roadmap_id: z.string(), name: z.string().optional(), description: z.string().optional(), color: z.string().optional() },
  }, async ({ roadmap_id, name, description, color }) => {
    const r = (await store.all<Roadmap>('roadmaps')).find(x => x.id === roadmap_id); if (!r) return fail('No roadmap with that id.');
    if (name) r.name = clip(name, 80); if (description != null) r.description = clip(description, 500); if (color && /^#[0-9a-f]{6}$/i.test(color)) r.color = color;
    r.updatedAt = now(); await store.put('roadmaps', r); return json({ ok: true });
  });

  server.registerTool('delete_roadmap', {
    title: 'Delete roadmap', description: 'Deletes a roadmap. Its topics are kept (moved to "no roadmap") unless delete_topics is true. Only use when the user clearly asks.',
    inputSchema: { roadmap_id: z.string(), delete_topics: z.boolean().optional() }, annotations: { destructiveHint: true },
  }, async ({ roadmap_id, delete_topics }) => {
    const r = (await store.all<Roadmap>('roadmaps')).find(x => x.id === roadmap_id); if (!r) return fail('No roadmap with that id.');
    for (const s of (await store.all<any>('skills')).map(normSkill).filter(s => s.roadmapId === roadmap_id)) {
      if (delete_topics) { await deleteFilesOf('skill:' + s.id); await store.del('skills', s.id); } else { s.roadmapId = ''; await saveSkill(s); }
    }
    await store.del('roadmaps', roadmap_id); return json({ deleted: r.name });
  });

  /* ---------------- topics ---------------- */
  server.registerTool('add_topics', {
    title: 'Add topics', description: 'Adds one or more topics to a roadmap. position is 1-based (where the first new topic goes); omit to add at the end.',
    inputSchema: { roadmap_id: z.string(), topics: z.array(topicSchema), position: z.number().int().optional() },
  }, async ({ roadmap_id, topics, position }) => {
    if (!(await store.all<Roadmap>('roadmaps')).some(r => r.id === roadmap_id)) return fail('No roadmap with that id.');
    const ids = topicsOf((await store.all<any>('skills')).map(normSkill), roadmap_id).map(s => s.id);
    const created: Skill[] = [];
    for (const tp of topics) { const s = newTopic(roadmap_id, tp, Date.now()); await store.put('skills', s); created.push(s); }
    const p = Math.max(0, Math.min((position ?? ids.length + 1) - 1, ids.length));
    ids.splice(p, 0, ...created.map(s => s.id)); await reorder(roadmap_id, ids);
    return json(created.map(s => ({ id: s.id, title: s.title, subtopic_ids: s.checklist.map(c => c.id) })));
  });

  server.registerTool('update_topic', {
    title: 'Update topic', description: 'Changes a topic: title, description, status (todo/learning/done), priority, target date (YYYY-MM-DD, or "" to clear), tags, resources to add, or its Markdown notes (notes replaces; append_notes adds to the end).',
    inputSchema: {
      topic_id: z.string(), title: z.string().optional(), description: z.string().optional(),
      status: z.enum(['todo', 'learning', 'done']).optional(), priority: z.enum(['high', 'medium', 'low']).optional(),
      target_date: z.string().optional(), tags: z.array(z.string()).optional(), add_resources: z.array(resourceSchema).optional(),
      notes: z.string().optional(), append_notes: z.string().optional(), roadmap_id: z.string().optional().describe('move the topic to another roadmap ("" = none)'),
    },
  }, async (i) => {
    const s = await getSkill(i.topic_id); if (!s) return fail('No topic with that id.');
    if (i.title) s.title = clip(i.title, 120);
    if (i.description != null) s.description = clip(i.description, 500);
    if (i.status) applyStatus(s, i.status);
    if (i.priority) s.priority = i.priority;
    if (i.target_date != null) s.target = /^\d{4}-\d{2}-\d{2}$/.test(i.target_date) ? i.target_date : '';
    if (i.tags) s.tags = i.tags.map(t => clip(t, 40)).filter(Boolean);
    if (i.add_resources) s.links.push(...links(i.add_resources));
    if (i.notes != null) s.notes = i.notes;
    if (i.append_notes) s.notes = s.notes.trim() ? s.notes.trim() + '\n\n' + i.append_notes : i.append_notes;
    if (i.roadmap_id != null) { s.roadmapId = i.roadmap_id; s.order = Date.now(); }
    await saveSkill(s); return json(topicView(s));
  });

  server.registerTool('move_topic', {
    title: 'Move topic', description: 'Moves a topic to a new 1-based position within its roadmap.',
    inputSchema: { topic_id: z.string(), position: z.number().int() },
  }, async ({ topic_id, position }) => {
    const s = await getSkill(topic_id); if (!s || !s.roadmapId) return fail('No topic with that id in a roadmap.');
    const ids = topicsOf((await store.all<any>('skills')).map(normSkill), s.roadmapId).map(x => x.id).filter(x => x !== s.id);
    ids.splice(Math.max(0, Math.min(position - 1, ids.length)), 0, s.id); await reorder(s.roadmapId, ids);
    return json({ ok: true });
  });

  server.registerTool('delete_topic', {
    title: 'Delete topic', description: 'Deletes a topic with its subtopics, notes and attached files. Only use when the user clearly asks.',
    inputSchema: { topic_id: z.string() }, annotations: { destructiveHint: true },
  }, async ({ topic_id }) => {
    const s = await getSkill(topic_id); if (!s) return fail('No topic with that id.');
    await deleteFilesOf('skill:' + s.id);
    for (const n of (await store.all<Note>('notes')).filter(n => n.skillId === s.id)) await store.put('notes', { ...n, skillId: '', updatedAt: now() });
    await store.del('skills', s.id); return json({ deleted: s.title });
  });

  /* ---------------- subtopics ---------------- */
  server.registerTool('add_subtopics', {
    title: 'Add subtopics', description: 'Appends subtopics to a topic.',
    inputSchema: { topic_id: z.string(), subtopics: z.array(z.string()) },
  }, async ({ topic_id, subtopics }) => {
    const s = await getSkill(topic_id); if (!s) return fail('No topic with that id.');
    const added = subtopics.map(x => clip(x, 120)).filter(Boolean).map(text => ({ id: uid(), text, state: '' as SubState, note: '', links: [] }));
    s.checklist.push(...added); if (s.status === 'done' && added.length) { s.status = 'learning'; s.doneAt = ''; }
    await saveSkill(s); return json(added.map(c => ({ id: c.id, text: c.text })));
  });

  server.registerTool('update_subtopic', {
    title: 'Update subtopic', description: 'Changes a subtopic: text, state (pending/learning/done/skip), Markdown note (note replaces; append_note adds), or resources to add.',
    inputSchema: {
      topic_id: z.string(), subtopic_id: z.string(), text: z.string().optional(),
      state: z.enum(['pending', 'learning', 'done', 'skip']).optional(), note: z.string().optional(), append_note: z.string().optional(),
      add_resources: z.array(resourceSchema).optional(),
    },
  }, async (i) => {
    const s = await getSkill(i.topic_id); if (!s) return fail('No topic with that id.');
    const c = s.checklist.find(x => x.id === i.subtopic_id); if (!c) return fail('No subtopic with that id in this topic.');
    if (i.text) c.text = clip(i.text, 120);
    if (i.state) applySubState(s, c, SUB_IN[i.state]);
    if (i.note != null) c.note = i.note;
    if (i.append_note) c.note = c.note.trim() ? c.note.trim() + '\n\n' + i.append_note : i.append_note;
    if (i.add_resources) c.links.push(...links(i.add_resources));
    await saveSkill(s); return json({ id: c.id, text: c.text, state: subOut(c.state), topic_status: s.status });
  });

  server.registerTool('delete_subtopics', {
    title: 'Delete subtopics', description: 'Removes subtopics from a topic. Only use when the user clearly asks.',
    inputSchema: { topic_id: z.string(), subtopic_ids: z.array(z.string()) }, annotations: { destructiveHint: true },
  }, async ({ topic_id, subtopic_ids }) => {
    const s = await getSkill(topic_id); if (!s) return fail('No topic with that id.');
    const before = s.checklist.length; s.checklist = s.checklist.filter(c => !subtopic_ids.includes(c.id));
    await saveSkill(s); return json({ removed: before - s.checklist.length });
  });

  /* ---------------- notes ---------------- */
  server.registerTool('list_notes', {
    title: 'List notes', description: 'Lists standalone notes (id, title, pinned, linked topic, short preview).',
    annotations: { readOnlyHint: true },
  }, async () => json((await store.all<Note>('notes')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(n => ({ id: n.id, title: n.title, pinned: n.pinned, topic_id: n.skillId || undefined, preview: n.body.slice(0, 160), updated: n.updatedAt.slice(0, 10) }))));

  server.registerTool('get_note', {
    title: 'Get note', description: 'Returns a note\'s full Markdown body.', inputSchema: { note_id: z.string() }, annotations: { readOnlyHint: true },
  }, async ({ note_id }) => { const n = (await store.all<Note>('notes')).find(x => x.id === note_id); return n ? json(n) : fail('No note with that id.'); });

  server.registerTool('save_note', {
    title: 'Create or update note', description: 'Creates a note (omit note_id) or updates one. body is Markdown (replaces); append adds to the end. topic_id links it to a topic.',
    inputSchema: { note_id: z.string().optional(), title: z.string().optional(), body: z.string().optional(), append: z.string().optional(), pinned: z.boolean().optional(), topic_id: z.string().optional() },
  }, async (i) => {
    const all = await store.all<Note>('notes'); const t = now();
    let n: Note | undefined = i.note_id ? all.find(x => x.id === i.note_id) : undefined;
    if (i.note_id && !n) return fail('No note with that id.');
    n ??= { id: uid(), title: '', body: '', pinned: false, skillId: '', createdAt: t, updatedAt: t };
    if (i.title != null) n.title = clip(i.title, 140);
    if (i.body != null) n.body = i.body;
    if (i.append) n.body = n.body.trim() ? n.body.trim() + '\n\n' + i.append : i.append;
    if (i.pinned != null) n.pinned = i.pinned;
    if (i.topic_id != null) n.skillId = i.topic_id;
    n.updatedAt = t; await store.put('notes', n); return json({ id: n.id, title: n.title });
  });

  server.registerTool('delete_note', {
    title: 'Delete note', description: 'Deletes a note and its attachments. Only use when the user clearly asks.',
    inputSchema: { note_id: z.string() }, annotations: { destructiveHint: true },
  }, async ({ note_id }) => {
    const n = (await store.all<Note>('notes')).find(x => x.id === note_id); if (!n) return fail('No note with that id.');
    await deleteFilesOf('note:' + n.id); await store.del('notes', n.id); return json({ deleted: n.title });
  });

  return server;
}
