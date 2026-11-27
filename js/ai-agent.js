const aiAgentState = {
    open: false,
    busy: false,
    showMemories: false,
    messages: [], // { id, role: 'user'|'model', text, actions?: [{ id, name, args, status: 'pending'|'done'|'cancelled'|'error' }] }
};

function buildStudioContextSnapshot() {
    const openTasks = db.tasks.filter((t) => t.status !== 'Done');
    const openBugs = db.bugs.filter((b) => b.status === 'Open' || b.status === 'In Progress');

    return {
        today_date: new Date().toISOString().slice(0, 10),
        studio_name: 'Reptile Studio',
        team_roster: db.profiles.map((p) => ({
            id: p.id,
            display_name: p.display_name,
            username: p.username,
            studio_title: p.studio_title,
            access_role: p.access_role,
            open_task_count: openTasks.filter((t) => t.assignee_id === p.id).length,
        })),
        projects: db.projects.map((p) => ({
            id: p.id,
            name: p.name,
            status: p.status,
            engine: p.engine,
            target_date: p.target_date,
            gdd_summary: (p.gdd_summary || '').slice(0, 300),
            milestones: Array.isArray(p.milestones) ? p.milestones : [],
        })),
        open_tasks: openTasks.slice(0, 40).map((t) => ({
            id: t.id,
            title: t.title,
            project_id: t.project_id,
            assignee_id: t.assignee_id,
            status: t.status,
            priority: t.priority,
            discipline: t.discipline,
            due_date: t.due_date,
        })),
        open_bugs: openBugs.slice(0, 30).map((b) => ({
            id: b.id,
            title: b.title,
            project_id: b.project_id,
            severity: b.severity,
            status: b.status,
            build_version: b.build_version,
        })),
        recent_builds: db.builds.slice(0, 8).map((b) => ({
            version: b.version,
            project_id: b.project_id,
            platform: b.platform,
            changelog: (b.changelog || '').slice(0, 160),
        })),
        recent_assets: db.assets.slice(0, 20).map((a) => ({
            name: a.name,
            project_id: a.project_id,
            asset_type: a.asset_type,
            status: a.status,
            folder: a.folder_id ? getFolderPathLabel(a.folder_id) : 'Root',
        })),
        recent_announcements: db.announcements.slice(0, 5).map((an) => ({
            title: an.title,
            category: an.category,
            pinned: an.pinned,
        })),
        studio_memories: (db.studio_ai_memories || []).map((m) => ({
            category: m.category,
            content: m.content,
        })),
    };
}

function toggleAIAgentDrawer() {
    if (aiAgentState.open) closeAIAgentDrawer();
    else openAIAgentDrawer();
}

function openAIAgentDrawer() {
    const root = document.getElementById('ai-drawer-root');
    if (!root) return;
    aiAgentState.open = true;
    root.classList.remove('hidden');
    root.classList.add('flex');
    renderAIAgentDrawer();
    setTimeout(() => document.getElementById('ai-prompt-input')?.focus(), 30);
}

function closeAIAgentDrawer() {
    const root = document.getElementById('ai-drawer-root');
    if (!root) return;
    aiAgentState.open = false;
    root.classList.add('hidden');
    root.classList.remove('flex');
}

function clearAIAgentChat() {
    aiAgentState.messages = [];
    renderAIAgentDrawer();
}

function toggleAIMemoryPanel() {
    aiAgentState.showMemories = !aiAgentState.showMemories;
    renderAIAgentDrawer();
}

function formatActionCardDetails(action) {
    const a = action.args || {};
    const projName = a.project_id ? (getProjectById(a.project_id)?.name || 'Unknown Project') : 'General Studio';
    const assigneeName = a.assignee_id ? (getProfileById(a.assignee_id)?.display_name || 'Unknown Member') : 'Unassigned';

    switch (action.name) {
        case 'create_task':
            return {
                badge: 'Create Task',
                color: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
                title: a.title || 'Untitled Task',
                meta: [
                    `Project: ${projName}`,
                    `Assignee: ${assigneeName}`,
                    `${a.status || 'Backlog'} · ${a.priority || 'Medium'} · ${a.discipline || 'Code'}`,
                    a.due_date ? `Due: ${a.due_date}` : '',
                ].filter(Boolean),
                body: a.description || '',
            };
        case 'update_task_status': {
            const task = db.tasks.find((t) => t.id === a.task_id);
            return {
                badge: 'Move Task',
                color: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
                title: task ? task.title : `Task ${a.task_id || ''}`,
                meta: [`${task?.status || '?'} → ${a.status || ''}`],
                body: '',
            };
        }
        case 'create_bug':
            return {
                badge: 'Log Bug',
                color: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
                title: a.title || 'Untitled Bug',
                meta: [`Project: ${projName}`, `Severity: ${a.severity || 'Medium'}`, `Build: ${a.build_version || 'v0.1.0'}`],
                body: [a.repro_steps, a.notes].filter(Boolean).join('\n'),
            };
        case 'update_bug_status': {
            const bug = db.bugs.find((b) => b.id === a.bug_id);
            return {
                badge: 'Update Bug',
                color: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
                title: bug ? bug.title : `Bug ${a.bug_id || ''}`,
                meta: [`${bug?.status || '?'} → ${a.status || ''}`],
                body: '',
            };
        }
        case 'create_announcement':
            return {
                badge: 'Announcement (Discord)',
                color: 'text-violet-300 border-violet-500/30 bg-violet-500/10',
                title: a.title || 'Studio Announcement',
                meta: [`Category: ${a.category || 'General'}`, a.pinned ? 'Pinned: Yes' : 'Pinned: No'],
                body: a.body || '',
            };
        case 'save_studio_memory':
            return {
                badge: 'Save Memory',
                color: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
                title: `[${a.category || 'Rule'}] Studio Memory`,
                meta: ['Remembered across future chats'],
                body: a.content || '',
            };
        default:
            return {
                badge: action.name,
                color: 'text-zinc-300 border-zinc-700 bg-zinc-800',
                title: action.name,
                meta: [],
                body: JSON.stringify(a, null, 2),
            };
    }
}

async function executeAIAction(msgId, actionId) {
    const msg = aiAgentState.messages.find((m) => m.id === msgId);
    const action = msg?.actions?.find((x) => x.id === actionId);
    if (!action || action.status !== 'pending') return;

    const a = action.args || {};
    try {
        if (action.name === 'create_task') {
            await saveTask({
                title: String(a.title || '').trim(),
                project_id: toNullableUuid(a.project_id),
                assignee_id: toNullableUuid(a.assignee_id),
                status: TASK_STATUSES.includes(a.status) ? a.status : 'Backlog',
                priority: TASK_PRIORITIES.includes(a.priority) ? a.priority : 'Medium',
                discipline: TASK_DISCIPLINES.includes(a.discipline) ? a.discipline : 'Code',
                due_date: toNullableDate(a.due_date),
                description: String(a.description || '').trim(),
            });
        } else if (action.name === 'update_task_status') {
            await updateTaskStatus(a.task_id, a.status);
        } else if (action.name === 'create_bug') {
            await saveBug({
                title: String(a.title || '').trim(),
                project_id: toNullableUuid(a.project_id),
                build_version: String(a.build_version || 'v0.1.0').trim(),
                severity: BUG_SEVERITIES.includes(a.severity) ? a.severity : 'Medium',
                status: BUG_STATUSES.includes(a.status) ? a.status : 'Open',
                repro_steps: String(a.repro_steps || '').trim(),
                notes: String(a.notes || '').trim(),
            });
        } else if (action.name === 'update_bug_status') {
            await updateBugStatus(a.bug_id, a.status);
        } else if (action.name === 'create_announcement') {
            if (!isAdmin()) {
                showToast('Only Admins can publish announcements.', 'error');
                action.status = 'error';
                renderAIAgentDrawer();
                return;
            }
            await saveAnnouncement({
                title: String(a.title || '').trim(),
                category: ANNOUNCEMENT_CATEGORIES.includes(a.category) ? a.category : 'General',
                pinned: Boolean(a.pinned),
                body: String(a.body || '').trim(),
            });
        } else if (action.name === 'save_studio_memory') {
            await saveStudioMemory({
                category: a.category || 'Rule',
                content: String(a.content || '').trim(),
            });
        } else {
            throw new Error(`Unsupported tool: ${action.name}`);
        }

        action.status = 'done';
    } catch (err) {
        console.error('[Reptile Studio AI] Action execution error:', err);
        action.status = 'error';
        showToast(`Action failed: ${err.message || err}`, 'error');
    }
    renderAIAgentDrawer();
}

async function executeAllAIActions(msgId) {
    const msg = aiAgentState.messages.find((m) => m.id === msgId);
    if (!msg?.actions) return;
    for (const act of msg.actions) {
        if (act.status === 'pending') {
            await executeAIAction(msgId, act.id);
        }
    }
}

function cancelAIAction(msgId, actionId) {
    const msg = aiAgentState.messages.find((m) => m.id === msgId);
    const action = msg?.actions?.find((x) => x.id === actionId);
    if (!action || action.status !== 'pending') return;
    action.status = 'cancelled';
    renderAIAgentDrawer();
}

async function sendAIPrompt(customPrompt = null) {
    if (!sb || aiAgentState.busy) return;
    const input = document.getElementById('ai-prompt-input');
    const promptText = (customPrompt !== null ? customPrompt : input?.value || '').trim();
    if (!promptText) return;

    if (input && customPrompt === null) input.value = '';

    aiAgentState.messages.push({
        id: `u_${Date.now()}`,
        role: 'user',
        text: promptText,
    });
    aiAgentState.busy = true;
    renderAIAgentDrawer();

    try {
        const apiMessages = aiAgentState.messages.map((m) => {
            let content = m.text || '';
            if (m.actions?.length) {
                const summary = m.actions
                    .map((act) => `[Proposed ${act.name} (${act.status}): ${JSON.stringify(act.args)}]`)
                    .join('\n');
                content = [content, summary].filter(Boolean).join('\n');
            }
            return { role: m.role, text: content };
        });

        const { data, error } = await sb.functions.invoke('gemini-studio-agent', {
            body: {
                messages: apiMessages,
                studioContext: buildStudioContextSnapshot(),
            },
        });

        if (error) throw new Error(error.message || 'Edge Function call failed');
        if (data?.error) throw new Error(data.error);

        const actions = Array.isArray(data?.toolCalls)
            ? data.toolCalls.map((tc, idx) => ({
                id: `act_${Date.now()}_${idx}`,
                name: tc.name,
                args: tc.args || {},
                status: 'pending',
            }))
            : [];

        aiAgentState.messages.push({
            id: `m_${Date.now()}`,
            role: 'model',
            text: data?.reply || (actions.length ? 'Review and confirm the proposed studio action below:' : 'Done.'),
            actions,
        });
    } catch (err) {
        console.error('[Reptile Studio AI] Error:', err);
        aiAgentState.messages.push({
            id: `err_${Date.now()}`,
            role: 'model',
            text: `Error reaching Studio AI: ${err.message || err}`,
        });
    } finally {
        aiAgentState.busy = false;
        renderAIAgentDrawer();
        const scroller = document.getElementById('ai-messages-scroll');
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }
}

function renderAIAgentDrawer() {
    const body = document.getElementById('ai-drawer-body');
    if (!body) return;

    const memCount = (db.studio_ai_memories || []).length;
    const starterPrompts = [
        'Summarize active blockers and team task workload.',
        'Create a new task for our current project (ask me who should own it).',
        'Log a playtest bug with repro steps.',
        'Remember a studio rule for future tasks.',
    ];

    body.innerHTML = `
    <!-- Header -->
    <div class="px-4 py-3.5 border-b border-[#27272a] flex items-center justify-between gap-2 shrink-0">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
          <i data-lucide="sparkles" class="w-4 h-4"></i>
        </div>
        <div class="min-w-0">
          <div class="text-sm font-semibold text-zinc-100 truncate">Reptile Studio AI</div>
          <div class="text-[11px] font-mono text-zinc-500 truncate">${db.profiles.length} members · ${db.projects.length} projects · ${memCount} memories</div>
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button type="button" onclick="toggleAIMemoryPanel()" class="px-2 py-1 rounded-lg bg-[#14151a] border border-[#27272a] text-[11px] ${aiAgentState.showMemories ? 'text-emerald-400 border-emerald-500/40' : 'text-zinc-400 hover:text-zinc-200'}">
          Memory (${memCount})
        </button>
        <button type="button" onclick="clearAIAgentChat()" class="px-2 py-1 rounded-lg bg-[#14151a] border border-[#27272a] text-[11px] text-zinc-400 hover:text-zinc-200">
          Clear
        </button>
        <button type="button" onclick="closeAIAgentDrawer()" class="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#14151a]">✕</button>
      </div>
    </div>

    <!-- Optional Saved Memories Panel -->
    ${aiAgentState.showMemories
            ? `<div class="p-3.5 border-b border-[#27272a] bg-[#09090b] max-h-56 overflow-y-auto space-y-2 shrink-0">
            <div class="flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span>PERSISTENT STUDIO MEMORY</span>
              <span class="text-zinc-500">Tell AI "Remember..." to add</span>
            </div>
            ${memCount
                ? db.studio_ai_memories
                    .map(
                        (m) => `
                      <div class="p-2.5 rounded-lg bg-[#0f1014] border border-[#27272a] flex items-start justify-between gap-2 text-xs">
                        <div class="min-w-0">
                          <span class="text-[10px] font-mono text-emerald-400 uppercase">${escapeHtml(m.category)}</span>
                          <p class="text-zinc-300 mt-0.5 leading-snug">${escapeHtml(m.content)}</p>
                        </div>
                        <button type="button" onclick="deleteStudioMemory('${m.id}')" class="text-[11px] text-red-400 hover:underline shrink-0">Remove</button>
                      </div>`
                    )
                    .join('')
                : `<p class="text-xs text-zinc-500">No studio memories saved yet.</p>`
            }
          </div>`
            : ''
        }

    <!-- Chat Messages -->
    <div id="ai-messages-scroll" class="flex-1 overflow-y-auto p-4 space-y-3.5">
      ${aiAgentState.messages.length
            ? aiAgentState.messages
                .map((m) => {
                    if (m.role === 'user') {
                        return `
                    <div class="flex justify-end">
                      <div class="max-w-[85%] rounded-xl px-3.5 py-2.5 bg-emerald-500/15 border border-emerald-500/30 text-xs text-zinc-100 whitespace-pre-wrap leading-relaxed">${escapeHtml(m.text)}</div>
                    </div>`;
                    }
                    const pendingCount = (m.actions || []).filter((x) => x.status === 'pending').length;
                    return `
                  <div class="space-y-2.5">
                    ${m.text
                            ? `<div class="max-w-[92%] rounded-xl px-3.5 py-2.5 bg-[#14151a] border border-[#27272a] text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">${escapeHtml(m.text)}</div>`
                            : ''
                        }
                    ${m.actions?.length
                            ? `<div class="space-y-2">
                            ${m.actions
                                .map((act) => {
                                    const info = formatActionCardDetails(act);
                                    return `
                                  <div class="rounded-xl p-3 bg-[#09090b] border border-[#27272a] space-y-2">
                                    <div class="flex items-center justify-between gap-2">
                                      <span class="px-2 py-0.5 rounded text-[10px] font-mono border ${info.color}">${escapeHtml(info.badge)}</span>
                                      ${act.status === 'done'
                                            ? `<span class="text-[11px] font-mono text-emerald-400">Executed ✓</span>`
                                            : act.status === 'cancelled'
                                                ? `<span class="text-[11px] font-mono text-zinc-500">Cancelled</span>`
                                                : act.status === 'error'
                                                    ? `<span class="text-[11px] font-mono text-red-400">Failed</span>`
                                                    : ''
                                        }
                                    </div>
                                    <div class="text-xs font-semibold text-zinc-100">${escapeHtml(info.title)}</div>
                                    ${info.meta.length ? `<div class="text-[11px] font-mono text-zinc-400">${escapeHtml(info.meta.join(' · '))}</div>` : ''}
                                    ${info.body ? `<p class="text-xs text-zinc-400 whitespace-pre-wrap">${escapeHtml(info.body)}</p>` : ''}
                                    ${act.status === 'pending'
                                            ? `<div class="flex items-center justify-end gap-2 pt-2 border-t border-[#27272a]">
                                            <button type="button" onclick="cancelAIAction('${m.id}', '${act.id}')" class="px-2.5 py-1 rounded-lg bg-[#14151a] border border-[#27272a] text-[11px] text-zinc-400 hover:text-zinc-200">Cancel</button>
                                            <button type="button" onclick="executeAIAction('${m.id}', '${act.id}')" class="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-[11px]">Confirm &amp; Run</button>
                                          </div>`
                                            : ''
                                        }
                                  </div>`;
                                })
                                .join('')}
                            ${pendingCount > 1
                                ? `<button type="button" onclick="executeAllAIActions('${m.id}')" class="w-full py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 font-semibold text-xs">
                                    Confirm &amp; Run All (${pendingCount})
                                  </button>`
                                : ''
                            }
                          </div>`
                            : ''
                        }
                  </div>`;
                })
                .join('')
            : `
            <div class="space-y-3 pt-2">
              <div class="p-3.5 rounded-xl bg-[#09090b] border border-[#27272a] text-xs text-zinc-400 leading-relaxed">
                Ask me to create or move tasks, log bugs, draft announcements, check teammate workload, or remember studio rules. I'll ask before guessing and always let you confirm before writing.
              </div>
              <div class="space-y-1.5">
                <div class="text-[10px] font-mono uppercase text-zinc-500">Quick Starters</div>
                ${starterPrompts
                .map(
                    (p) => `
                    <button type="button" data-ai-starter="${escapeHtml(p)}" class="w-full text-left px-3 py-2 rounded-lg bg-[#09090b] hover:bg-[#14151a] border border-[#27272a] text-xs text-zinc-300 transition">
                      ${escapeHtml(p)}
                    </button>`
                )
                .join('')}
              </div>
            </div>`
        }
      ${aiAgentState.busy
            ? `<div class="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#14151a] border border-[#27272a] text-xs font-mono text-emerald-400">Thinking with studio context...</div>`
            : ''
        }
    </div>

    <!-- Input Bar -->
    <form id="ai-prompt-form" class="p-3.5 border-t border-[#27272a] bg-[#09090b] flex items-end gap-2 shrink-0">
      <textarea id="ai-prompt-input" rows="2" placeholder="Ask Reptile Studio AI... (Enter to send, Shift+Enter for newline)"
        class="flex-1 bg-[#0f1014] border border-[#27272a] focus:border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-zinc-100 outline-none resize-none"></textarea>
      <button type="submit" ${aiAgentState.busy ? 'disabled' : ''}
        class="px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs shrink-0">
        Send
      </button>
    </form>
  `;

    body.querySelectorAll('[data-ai-starter]').forEach((btn) => {
        btn.addEventListener('click', () => sendAIPrompt(btn.dataset.aiStarter));
    });

    const form = document.getElementById('ai-prompt-form');
    const textarea = document.getElementById('ai-prompt-input');
    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        sendAIPrompt();
    });
    textarea?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendAIPrompt();
        }
    });

    refreshIcons();
    const scroller = document.getElementById('ai-messages-scroll');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
}