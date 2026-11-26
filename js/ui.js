const VIEW_META = {
    overview: { title: 'Overview', subtitle: 'Studio pulse, active work & live feed' },
    projects: { title: 'Projects', subtitle: 'Game titles, GDD notes & milestones' },
    board: { title: 'Task Board', subtitle: 'Sprint Kanban across disciplines' },
    bugs: { title: 'Bug Tracker', subtitle: 'Playtest issues, repro steps & build versions' },
    builds: { title: 'Builds & Docs', subtitle: 'Playable builds, changelogs & studio vault' },
    team: { title: 'Team & Access', subtitle: 'Reptile Studio roster & live activity log' },
};

function navigateTo(viewName) {
    if (!VIEW_META[viewName]) viewName = 'overview';
    currentView = viewName;

    document.querySelectorAll('.nav-item').forEach((btn) => {
        const active = btn.dataset.nav === viewName;
        btn.className = `nav-item w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm font-medium transition ${active
            ? 'bg-emerald-500/12 text-emerald-300 border border-emerald-500/25'
            : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#14151a] border border-transparent'
            }`;
    });

    const meta = VIEW_META[viewName];
    const titleEl = document.getElementById('topbar-title');
    const subEl = document.getElementById('topbar-subtitle');
    if (titleEl) titleEl.textContent = meta.title;
    if (subEl) subEl.textContent = meta.subtitle;

    toggleMobileSidebar(false);
    renderCurrentView();
}

function toggleMobileSidebar(open) {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar || !backdrop) return;
    if (open) {
        sidebar.classList.remove('-translate-x-full');
        backdrop.classList.remove('hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        backdrop.classList.add('hidden');
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    const border =
        type === 'error'
            ? 'border-red-500/40 text-red-300'
            : type === 'info'
                ? 'border-[#27272a] text-zinc-200'
                : 'border-emerald-500/35 text-emerald-300';
    el.className = `pointer-events-auto bg-[#0f1014] border ${border} rounded-lg px-3.5 py-2.5 shadow-xl text-xs font-medium flex items-center justify-between gap-3 animate-in`;
    el.innerHTML = `<span>${escapeHtml(message)}</span><button type="button" onclick="this.parentElement.remove()" class="text-zinc-500 hover:text-zinc-200">✕</button>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 4500 : 2800);
}

function openModal(html, maxWidth = 'max-w-lg') {
    const root = document.getElementById('modal-root');
    const panel = document.getElementById('modal-panel');
    panel.className = `relative w-full ${maxWidth} bg-[#0f1014] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden my-auto animate-in`;
    panel.innerHTML = html;
    root.classList.remove('hidden');
    root.classList.add('flex');
    refreshIcons();
}

function closeModal() {
    const root = document.getElementById('modal-root');
    root.classList.add('hidden');
    root.classList.remove('flex');
    document.getElementById('modal-panel').innerHTML = '';
}

function openConfirmModal({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm }) {
    openModal(`
    <div class="p-5">
      <h3 class="text-sm font-semibold text-zinc-100">${escapeHtml(title)}</h3>
      <p class="text-xs text-zinc-400 mt-1.5 leading-relaxed">${escapeHtml(message)}</p>
      <div class="flex justify-end gap-2 mt-5 pt-4 border-t border-[#27272a]">
        <button type="button" onclick="closeModal()" class="px-3.5 py-2 rounded-lg text-xs bg-[#14151a] border border-[#27272a] text-zinc-300">Cancel</button>
        <button type="button" id="confirm-yes-btn" class="px-3.5 py-2 rounded-lg text-xs font-semibold ${danger ? 'bg-red-500 hover:bg-red-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
        }">${escapeHtml(confirmLabel)}</button>
      </div>
    </div>
  `, 'max-w-md');

    document.getElementById('confirm-yes-btn').addEventListener('click', async () => {
        closeModal();
        await onConfirm();
    });
}

function copyBuildUrl(buildId) {
    const b = db.builds.find((x) => x.id === buildId);
    if (!b) return;
    navigator.clipboard?.writeText(b.download_url).then(
        () => showToast('Build link copied', 'success'),
        () => showToast('Could not copy link', 'error')
    );
}

// --- Command Palette ---
function openCommandPalette() {
    const root = document.getElementById('cmd-root');
    const input = document.getElementById('cmd-input');
    root.classList.remove('hidden');
    root.classList.add('flex');
    input.value = '';
    renderCommandResults('');
    setTimeout(() => input.focus(), 20);
    refreshIcons();
}

function closeCommandPalette() {
    const root = document.getElementById('cmd-root');
    root.classList.add('hidden');
    root.classList.remove('flex');
}

function renderCommandResults(query) {
    const q = query.trim().toLowerCase();
    const container = document.getElementById('cmd-results');
    const items = [];

    db.projects.forEach((p) => {
        if (!q || p.name.toLowerCase().includes(q) || (p.engine || '').toLowerCase().includes(q)) {
            items.push({ label: p.name, sub: `Project · ${p.status}`, action: () => navigateTo('projects') });
        }
    });
    db.tasks.forEach((t) => {
        if (!q || t.title.toLowerCase().includes(q) || t.discipline.toLowerCase().includes(q)) {
            items.push({ label: t.title, sub: `Task · ${t.status} · ${t.discipline}`, action: () => navigateTo('board') });
        }
    });
    db.bugs.forEach((b) => {
        if (!q || b.title.toLowerCase().includes(q) || b.severity.toLowerCase().includes(q)) {
            items.push({ label: b.title, sub: `Bug · ${b.severity} · ${b.status}`, action: () => navigateTo('bugs') });
        }
    });

    if (!items.length) {
        container.innerHTML = `<div class="p-4 text-center text-xs text-zinc-500">No matching studio items.</div>`;
        return;
    }

    container.innerHTML = items
        .slice(0, 12)
        .map(
            (item, i) => `
      <button type="button" data-cmd-idx="${i}" class="w-full text-left px-3 py-2 rounded-lg hover:bg-[#14151a] flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-zinc-200 truncate">${escapeHtml(item.label)}</span>
        <span class="text-[11px] font-mono text-zinc-500 shrink-0">${escapeHtml(item.sub)}</span>
      </button>`
        )
        .join('');

    container.querySelectorAll('[data-cmd-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.cmdIdx);
            closeCommandPalette();
            items[idx]?.action();
        });
    });
}

// --- Modals ---
function openProjectModal(projectId = null) {
    const p = projectId ? getProjectById(projectId) : null;
    const milestonesText = Array.isArray(p?.milestones)
        ? p.milestones.map((m) => m.title).join('\n')
        : 'Core prototype loop\nVertical slice build\nPlaytest milestone';

    openModal(`
    <form id="project-form" class="p-5 space-y-3.5">
      <div class="flex items-center justify-between pb-2 border-b border-[#27272a]">
        <h3 class="text-sm font-semibold text-zinc-100">${p ? 'Edit Project' : 'New Project'}</h3>
        <button type="button" onclick="closeModal()" class="text-zinc-500 hover:text-zinc-200">✕</button>
      </div>
      <div>
        <label class="block text-xs text-zinc-400 mb-1">Project Name *</label>
        <input name="name" required value="${escapeHtml(p?.name || '')}" placeholder="e.g., Night Shift Ramen"
          class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Status</label>
          <select name="status" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100">
            ${PROJECT_STATUSES.map((s) => `<option ${p?.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Engine</label>
          <input name="engine" value="${escapeHtml(p?.engine || 'Unity')}" placeholder="Unity URP"
            class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Target Date</label>
          <input type="date" name="target_date" value="${escapeHtml(p?.target_date || '')}"
            class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none" />
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Repo / Store URL</label>
          <input name="repo_url" value="${escapeHtml(p?.repo_url || '')}" placeholder="https://github.com/..."
            class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none" />
        </div>
      </div>
      <div>
        <label class="block text-xs text-zinc-400 mb-1">GDD Summary</label>
        <textarea name="gdd_summary" rows="2" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none">${escapeHtml(p?.gdd_summary || '')}</textarea>
      </div>
      <div>
        <label class="block text-xs text-zinc-400 mb-1">Milestones (one per line)</label>
        <textarea name="milestones_raw" rows="3" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 outline-none">${escapeHtml(milestonesText)}</textarea>
      </div>
      <div class="flex justify-end gap-2 pt-3 border-t border-[#27272a]">
        <button type="button" onclick="closeModal()" class="px-3.5 py-2 rounded-lg text-xs bg-[#14151a] border border-[#27272a] text-zinc-300">Cancel</button>
        <button type="submit" class="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950">Save Project</button>
      </div>
    </form>
  `);

    document.getElementById('project-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const prevMap = new Map((Array.isArray(p?.milestones) ? p.milestones : []).map((m) => [m.title, Boolean(m.done)]));
        const milestones = f.milestones_raw.value
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((title) => ({ title, done: prevMap.get(title) || false }));

        closeModal();
        await saveProject(
            {
                name: f.name.value.trim(),
                status: f.status.value,
                engine: f.engine.value.trim() || 'Unity',
                target_date: toNullableDate(f.target_date.value),
                repo_url: f.repo_url.value.trim(),
                gdd_summary: f.gdd_summary.value.trim(),
                milestones,
            },
            p?.id || null
        );
    });
}

function openTaskModal(taskId = null, defaultStatus = 'Backlog') {
    const t = taskId ? db.tasks.find((x) => x.id === taskId) : null;
    openModal(`
    <form id="task-form" class="p-5 space-y-3.5">
      <div class="flex items-center justify-between pb-2 border-b border-[#27272a]">
        <h3 class="text-sm font-semibold text-zinc-100">${t ? 'Edit Task' : 'New Task'}</h3>
        <button type="button" onclick="closeModal()" class="text-zinc-500 hover:text-zinc-200">✕</button>
      </div>
      <div>
        <label class="block text-xs text-zinc-400 mb-1">Task Title *</label>
        <input name="title" required value="${escapeHtml(t?.title || '')}" placeholder="e.g., Implement customer order queue"
          class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Project</label>
          <select name="project_id" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100">
            <option value="">General Studio</option>
            ${db.projects.map((p) => `<option value="${p.id}" ${(t?.project_id || (filters.boardProject !== 'All' ? filters.boardProject : '')) === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Assignee</label>
          <select name="assignee_id" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100">
            <option value="">Unassigned</option>
            ${db.profiles.map((m) => `<option value="${m.id}" ${(t?.assignee_id || currentProfile?.id) === m.id ? 'selected' : ''}>${escapeHtml(m.display_name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-2.5">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Status</label>
          <select name="status" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-2 text-xs text-zinc-100">
            ${TASK_STATUSES.map((s) => `<option ${(t?.status || defaultStatus) === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Priority</label>
          <select name="priority" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-2 text-xs text-zinc-100">
            ${TASK_PRIORITIES.map((pr) => `<option ${(t?.priority || 'Medium') === pr ? 'selected' : ''}>${pr}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Discipline</label>
          <select name="discipline" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-2 text-xs text-zinc-100">
            ${TASK_DISCIPLINES.map((d) => `<option ${(t?.discipline || 'Code') === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Due Date</label>
          <input type="date" name="due_date" value="${escapeHtml(t?.due_date || '')}"
            class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none" />
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Notes</label>
          <input name="description" value="${escapeHtml(t?.description || '')}" placeholder="Context or acceptance criteria"
            class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none" />
        </div>
      </div>
      <div class="flex items-center justify-between pt-3 border-t border-[#27272a]">
        ${t
            ? `<button type="button" id="delete-task-btn" class="px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10">Delete</button>`
            : '<span></span>'
        }
        <div class="flex gap-2">
          <button type="button" onclick="closeModal()" class="px-3.5 py-2 rounded-lg text-xs bg-[#14151a] border border-[#27272a] text-zinc-300">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950">Save Task</button>
        </div>
      </div>
    </form>
  `);

    if (t) {
        document.getElementById('delete-task-btn').addEventListener('click', () => {
            openConfirmModal({
                title: 'Delete Task',
                message: `Remove "${t.title}" from the board?`,
                confirmLabel: 'Delete',
                danger: true,
                onConfirm: () => deleteTask(t.id, t.title),
            });
        });
    }

    document.getElementById('task-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        closeModal();
        await saveTask(
            {
                title: f.title.value.trim(),
                project_id: toNullableUuid(f.project_id.value),
                assignee_id: toNullableUuid(f.assignee_id.value),
                status: f.status.value,
                priority: f.priority.value,
                discipline: f.discipline.value,
                due_date: toNullableDate(f.due_date.value),
                description: f.description.value.trim(),
            },
            t?.id || null
        );
    });
}

function openBugModal(bugId = null) {
    const b = bugId ? db.bugs.find((x) => x.id === bugId) : null;
    openModal(`
    <form id="bug-form" class="p-5 space-y-3.5">
      <div class="flex items-center justify-between pb-2 border-b border-[#27272a]">
        <h3 class="text-sm font-semibold text-zinc-100">${b ? 'Inspect / Edit Bug' : 'Log Bug'}</h3>
        <button type="button" onclick="closeModal()" class="text-zinc-500 hover:text-zinc-200">✕</button>
      </div>
      <div>
        <label class="block text-xs text-zinc-400 mb-1">Summary *</label>
        <input name="title" required value="${escapeHtml(b?.title || '')}" placeholder="e.g., Camera clips through counter at 2:00 AM"
          class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Project</label>
          <select name="project_id" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100">
            <option value="">General Studio</option>
            ${db.projects.map((p) => `<option value="${p.id}" ${b?.project_id === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Build Version</label>
          <input name="build_version" value="${escapeHtml(b?.build_version || 'v0.1.0')}" placeholder="v0.1.0"
            class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 outline-none" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Severity</label>
          <select name="severity" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100">
            ${BUG_SEVERITIES.map((s) => `<option ${(b?.severity || 'Medium') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Status</label>
          <select name="status" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100">
            ${BUG_STATUSES.map((st) => `<option ${(b?.status || 'Open') === st ? 'selected' : ''}>${st}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <label class="block text-xs text-zinc-400 mb-1">Reproduction Steps</label>
        <textarea name="repro_steps" rows="2" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none">${escapeHtml(b?.repro_steps || '')}</textarea>
      </div>
      <div>
        <label class="block text-xs text-zinc-400 mb-1">Engineering Notes</label>
        <textarea name="notes" rows="2" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none">${escapeHtml(b?.notes || '')}</textarea>
      </div>
      <div class="flex items-center justify-between pt-3 border-t border-[#27272a]">
        ${b
            ? `<button type="button" id="delete-bug-btn" class="px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10">Delete</button>`
            : '<span></span>'
        }
        <div class="flex gap-2">
          <button type="button" onclick="closeModal()" class="px-3.5 py-2 rounded-lg text-xs bg-[#14151a] border border-[#27272a] text-zinc-300">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950">Save Bug</button>
        </div>
      </div>
    </form>
  `);

    if (b) {
        document.getElementById('delete-bug-btn').addEventListener('click', () => {
            openConfirmModal({
                title: 'Delete Bug',
                message: `Remove "${b.title}"?`,
                confirmLabel: 'Delete',
                danger: true,
                onConfirm: () => deleteBug(b.id, b.title),
            });
        });
    }

    document.getElementById('bug-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        closeModal();
        await saveBug(
            {
                title: f.title.value.trim(),
                project_id: toNullableUuid(f.project_id.value),
                build_version: f.build_version.value.trim() || 'v0.1.0',
                severity: f.severity.value,
                status: f.status.value,
                repro_steps: f.repro_steps.value.trim(),
                notes: f.notes.value.trim(),
            },
            b?.id || null
        );
    });
}

function openBuildModal() {
    openModal(`
    <form id="build-form" class="p-5 space-y-3.5">
      <div class="flex items-center justify-between pb-2 border-b border-[#27272a]">
        <h3 class="text-sm font-semibold text-zinc-100">Log Playable Build</h3>
        <button type="button" onclick="closeModal()" class="text-zinc-500 hover:text-zinc-200">✕</button>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Project</label>
          <select name="project_id" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100">
            <option value="">General Studio</option>
            ${db.projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Version *</label>
          <input name="version" required placeholder="v0.2.1-alpha"
            class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 outline-none" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Platform</label>
          <select name="platform" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100">
            ${BUILD_PLATFORMS.map((pl) => `<option>${pl}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Download / Drive / itch URL *</label>
          <input name="download_url" required placeholder="https://..."
            class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none" />
        </div>
      </div>
      <div>
        <label class="block text-xs text-zinc-400 mb-1">Changelog</label>
        <textarea name="changelog" rows="3" placeholder="What changed in this build?"
          class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none"></textarea>
      </div>
      <div class="flex justify-end gap-2 pt-3 border-t border-[#27272a]">
        <button type="button" onclick="closeModal()" class="px-3.5 py-2 rounded-lg text-xs bg-[#14151a] border border-[#27272a] text-zinc-300">Cancel</button>
        <button type="submit" class="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950">Save Build</button>
      </div>
    </form>
  `);

    document.getElementById('build-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        closeModal();
        await saveBuild({
            project_id: toNullableUuid(f.project_id.value),
            version: f.version.value.trim(),
            platform: f.platform.value,
            download_url: f.download_url.value.trim(),
            changelog: f.changelog.value.trim(),
        });
    });
}

function openDocModal() {
    openModal(`
    <form id="doc-form" class="p-5 space-y-3.5">
      <div class="flex items-center justify-between pb-2 border-b border-[#27272a]">
        <h3 class="text-sm font-semibold text-zinc-100">Add Studio Doc / Link</h3>
        <button type="button" onclick="closeModal()" class="text-zinc-500 hover:text-zinc-200">✕</button>
      </div>
      <div>
        <label class="block text-xs text-zinc-400 mb-1">Title *</label>
        <input name="title" required placeholder="e.g., Kiritani Loop GDD & Audio Notes"
          class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Category</label>
          <select name="category" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100">
            ${DOC_CATEGORIES.map((c) => `<option>${c}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Project</label>
          <select name="project_id" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100">
            <option value="">General Studio</option>
            ${db.projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <label class="block text-xs text-zinc-400 mb-1">URL *</label>
        <input name="url" required placeholder="https://..."
          class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none" />
      </div>
      <div>
        <label class="block text-xs text-zinc-400 mb-1">Notes</label>
        <textarea name="notes" rows="2" class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none"></textarea>
      </div>
      <div class="flex justify-end gap-2 pt-3 border-t border-[#27272a]">
        <button type="button" onclick="closeModal()" class="px-3.5 py-2 rounded-lg text-xs bg-[#14151a] border border-[#27272a] text-zinc-300">Cancel</button>
        <button type="submit" class="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950">Save Doc</button>
      </div>
    </form>
  `);

    document.getElementById('doc-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        closeModal();
        await saveDoc({
            title: f.title.value.trim(),
            category: f.category.value,
            project_id: toNullableUuid(f.project_id.value),
            url: f.url.value.trim(),
            notes: f.notes.value.trim(),
        });
    });
}

function openEditProfileModal(memberId) {
    const m = getProfileById(memberId) || currentProfile;
    if (!m) return;
    openModal(`
    <form id="profile-edit-form" class="p-5 space-y-3.5">
      <div class="flex items-center justify-between pb-2 border-b border-[#27272a]">
        <h3 class="text-sm font-semibold text-zinc-100">Edit Member Profile</h3>
        <button type="button" onclick="closeModal()" class="text-zinc-500 hover:text-zinc-200">✕</button>
      </div>
      <div>
        <label class="block text-xs text-zinc-400 mb-1">Display Name *</label>
        <input name="display_name" required value="${escapeHtml(m.display_name)}"
          class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Handle *</label>
          <input name="username" required value="${escapeHtml(m.username)}"
            class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 outline-none" />
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Studio Role *</label>
          <input name="studio_title" required value="${escapeHtml(m.studio_title)}"
            class="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none" />
        </div>
      </div>
      <div class="flex justify-end gap-2 pt-3 border-t border-[#27272a]">
        <button type="button" onclick="closeModal()" class="px-3.5 py-2 rounded-lg text-xs bg-[#14151a] border border-[#27272a] text-zinc-300">Cancel</button>
        <button type="submit" class="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950">Save</button>
      </div>
    </form>
  `, 'max-w-md');

    document.getElementById('profile-edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        closeModal();
        await updateMemberProfile(m.id, {
            display_name: f.display_name.value.trim(),
            username: f.username.value.trim().toLowerCase(),
            studio_title: f.studio_title.value.trim(),
        });
    });
}