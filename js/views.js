function getProjectProgress(project) {
  const pTasks = db.tasks.filter((t) => t.project_id === project.id);
  if (pTasks.length > 0) {
    return Math.round((pTasks.filter((t) => t.status === 'Done').length / pTasks.length) * 100);
  }
  const ms = Array.isArray(project.milestones) ? project.milestones : [];
  if (ms.length > 0) {
    return Math.round((ms.filter((m) => m.done).length / ms.length) * 100);
  }
  return 0;
}

function enterFolder(folderId) {
  filters.currentFolderId = folderId || null;
  renderCurrentView();
}

function renderCurrentView() {
  const main = document.getElementById('main-content');
  if (!main || !currentProfile) return;

  switch (currentView) {
    case 'announcements':
      main.innerHTML = renderAnnouncementsView();
      bindAnnouncementsEvents();
      break;
    case 'projects':
      main.innerHTML = renderProjectsView();
      bindProjectsEvents();
      break;
    case 'board':
      main.innerHTML = renderBoardView();
      bindBoardEvents();
      break;
    case 'bugs':
      main.innerHTML = renderBugsView();
      bindBugsEvents();
      break;
    case 'builds':
      main.innerHTML = renderBuildsDocsView();
      break;
    case 'assets':
      main.innerHTML = renderAssetsView();
      bindAssetsEvents();
      break;
    case 'team':
      main.innerHTML = renderTeamView();
      bindTeamEvents();
      break;
    case 'overview':
    default:
      main.innerHTML = renderOverviewView();
      bindOverviewEvents();
      break;
  }
  refreshIcons();
}

// 1. OVERVIEW (WITH PINNED ANNOUNCEMENT BANNER)
function renderOverviewView() {
  const openTasks = db.tasks.filter((t) => t.status !== 'Done').length;
  const openBugs = db.bugs.filter((b) => b.status === 'Open' || b.status === 'In Progress').length;
  const blockers = db.bugs.filter((b) => b.severity === 'Blocker' && b.status !== 'Fixed' && b.status !== 'Closed').length;
  const myTasks = db.tasks.filter((t) => t.assignee_id === currentProfile.id && (filters.myTasksShowDone || t.status !== 'Done'));
  const latestPinned = db.announcements.find((a) => a.pinned) || db.announcements[0] || null;

  return `
    <div class="space-y-6 animate-in">
      ${latestPinned
      ? `<div class="p-4 rounded-xl bg-emerald-500/[0.07] border border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2 text-[11px] font-mono text-emerald-400 uppercase">
                  <span>${latestPinned.pinned ? '📌 Pinned' : '📢 Latest'} · ${escapeHtml(latestPinned.category)}</span>
                </div>
                <div class="text-sm font-semibold text-zinc-100 mt-0.5">${escapeHtml(latestPinned.title)}</div>
                <p class="text-xs text-zinc-400 mt-1 line-clamp-2">${escapeHtml(latestPinned.body)}</p>
              </div>
              <button type="button" onclick="navigateTo('announcements')" class="px-3 py-1.5 rounded-lg bg-[#0f1014] border border-[#27272a] text-xs text-zinc-200 hover:border-emerald-500/40 shrink-0">
                View All
              </button>
            </div>`
      : ''
    }

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-4">
          <div class="text-[11px] font-mono text-zinc-500 uppercase">Active Projects</div>
          <div class="text-2xl font-semibold text-zinc-100 mt-1">${db.projects.length}</div>
        </div>
        <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-4">
          <div class="text-[11px] font-mono text-zinc-500 uppercase">Open Tasks</div>
          <div class="text-2xl font-semibold text-emerald-400 mt-1">${openTasks}</div>
        </div>
        <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-4">
          <div class="text-[11px] font-mono text-zinc-500 uppercase">Active Bugs</div>
          <div class="text-2xl font-semibold text-amber-400 mt-1">${openBugs}</div>
        </div>
        <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-4">
          <div class="text-[11px] font-mono text-zinc-500 uppercase">Blockers / Storage</div>
          <div class="text-2xl font-semibold ${blockers > 0 ? 'text-red-400' : 'text-zinc-300'} mt-1">${blockers} <span class="text-xs font-mono text-zinc-500 font-normal">· ${formatBytes(db.storage.used_bytes)}</span></div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div class="lg:col-span-2 space-y-5">
          <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold text-zinc-100">Active Projects</h3>
              <button type="button" onclick="openProjectModal()" class="text-xs text-emerald-400 hover:text-emerald-300 font-medium">+ Add Project</button>
            </div>
            ${db.projects.length
      ? `<div class="space-y-3.5">${db.projects
        .map((p) => {
          const pct = getProjectProgress(p);
          return `
                        <div class="p-3.5 rounded-lg bg-[#09090b] border border-[#27272a]">
                          <div class="flex items-center justify-between gap-2 mb-2">
                            <div class="min-w-0">
                              <div class="text-sm font-medium text-zinc-100 truncate">${escapeHtml(p.name)}</div>
                              <div class="text-[11px] font-mono text-zinc-500">${escapeHtml(p.engine || 'Unity')} · ${escapeHtml(p.status)}</div>
                            </div>
                            <span class="text-xs font-mono text-emerald-400">${pct}%</span>
                          </div>
                          <div class="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden"><div class="h-full bg-emerald-500 rounded-full" style="width:${pct}%"></div></div>
                        </div>`;
        })
        .join('')}</div>`
      : `<p class="text-xs text-zinc-500">No projects yet.</p>`
    }
          </div>

          <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-zinc-100">My Tasks (${escapeHtml(currentProfile.display_name)})</h3>
              <label class="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                <input id="my-tasks-done-toggle" type="checkbox" ${filters.myTasksShowDone ? 'checked' : ''} class="rounded border-zinc-700 bg-zinc-900" />
                Show Done
              </label>
            </div>
            ${myTasks.length
      ? `<div class="divide-y divide-[#27272a]">${myTasks
        .map((t) => {
          const isDone = t.status === 'Done';
          return `
                        <div class="py-2.5 flex items-center justify-between gap-3">
                          <label class="flex items-center gap-2.5 min-w-0 cursor-pointer">
                            <input type="checkbox" data-quick-task-id="${t.id}" ${isDone ? 'checked' : ''} class="rounded border-zinc-700 bg-zinc-900" />
                            <span class="text-xs ${isDone ? 'line-through text-zinc-500' : 'text-zinc-200'} truncate">${escapeHtml(t.title)}</span>
                          </label>
                          <span class="text-[10px] font-mono text-zinc-500 shrink-0">${escapeHtml(t.status)}</span>
                        </div>`;
        })
        .join('')}</div>`
      : `<p class="text-xs text-zinc-500">No assigned tasks matching this filter.</p>`
    }
          </div>
        </div>

        <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-5">
          <h3 class="text-sm font-semibold text-zinc-100 mb-3">Studio Activity</h3>
          ${db.activity_logs.length
      ? `<div class="space-y-3">${db.activity_logs
        .slice(0, 14)
        .map(
          (a) => `
                    <div class="text-xs border-b border-[#27272a]/70 pb-2.5 last:border-none">
                      <span class="font-medium text-emerald-400">${escapeHtml(a.actor_name)}</span>
                      <span class="text-zinc-400"> ${escapeHtml(a.action)}</span>
                      <span class="text-zinc-200 font-medium"> "${escapeHtml(a.target)}"</span>
                    </div>`
        )
        .join('')}</div>`
      : `<p class="text-xs text-zinc-500">Activity will appear here as your team updates items.</p>`
    }
        </div>
      </div>
    </div>
  `;
}

function bindOverviewEvents() {
  document.getElementById('my-tasks-done-toggle')?.addEventListener('change', (e) => {
    filters.myTasksShowDone = e.target.checked;
    renderCurrentView();
  });
  document.querySelectorAll('[data-quick-task-id]').forEach((cb) => {
    cb.addEventListener('change', async (e) => {
      await updateTaskStatus(e.target.dataset.quickTaskId, e.target.checked ? 'Done' : 'In Progress');
    });
  });
}

// 2. ANNOUNCEMENTS (ADMIN POSTS ONLY)
function renderAnnouncementsView() {
  const badgeColor = {
    Urgent: 'bg-red-500/15 text-red-400 border-red-500/30',
    Milestone: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    Release: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    General: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  };

  return `
    <div class="space-y-4 animate-in">
      <div class="flex flex-wrap items-center justify-between gap-3 bg-[#0f1014] border border-[#27272a] rounded-xl p-4">
        <div>
          <h3 class="text-sm font-semibold text-zinc-100">Studio Announcement Channel</h3>
          <p class="text-xs text-zinc-500 mt-0.5">Official updates posted by Admins (auto-synced to Discord if enabled).</p>
        </div>
        ${isAdmin()
      ? `<button type="button" onclick="openAnnouncementModal()" class="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs">
                + Post Announcement
              </button>`
      : `<span class="text-[11px] font-mono text-zinc-500">Read-only (Admin posts only)</span>`
    }
      </div>

      ${db.announcements.length
      ? `<div class="space-y-3.5">${db.announcements
        .map((an) => {
          const author = getProfileById(an.author_id);
          return `
                  <article class="bg-[#0f1014] border ${an.pinned ? 'border-emerald-500/35' : 'border-[#27272a]'} rounded-xl p-5 space-y-2.5">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="px-2 py-0.5 rounded text-[11px] font-medium border ${badgeColor[an.category] || badgeColor.General}">${escapeHtml(an.category)}</span>
                        ${an.pinned ? `<span class="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">PINNED</span>` : ''}
                        <span class="text-xs text-zinc-500">by ${escapeHtml(author?.display_name || 'Admin')} · ${new Date(an.created_at).toLocaleString()}</span>
                      </div>
                      ${isAdmin()
              ? `<div class="flex items-center gap-1.5">
                              <button type="button" onclick="toggleAnnouncementPin('${an.id}', ${Boolean(an.pinned)})" class="px-2 py-1 rounded bg-[#14151a] border border-[#27272a] text-[11px] text-zinc-300">${an.pinned ? 'Unpin' : 'Pin'}</button>
                              <button type="button" onclick="openAnnouncementModal('${an.id}')" class="px-2 py-1 rounded bg-[#14151a] border border-[#27272a] text-[11px] text-zinc-300">Edit</button>
                              <button type="button" data-del-ann="${an.id}" data-del-ann-title="${escapeHtml(an.title)}" class="px-2 py-1 rounded bg-[#14151a] border border-[#27272a] text-[11px] text-red-400">Delete</button>
                            </div>`
              : ''
            }
                    </div>
                    <h4 class="text-base font-semibold text-zinc-100">${escapeHtml(an.title)}</h4>
                    <p class="text-xs sm:text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">${escapeHtml(an.body)}</p>
                  </article>`;
        })
        .join('')}</div>`
      : `<div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-8 text-center text-xs text-zinc-500">No studio announcements yet.</div>`
    }
    </div>
  `;
}

function bindAnnouncementsEvents() {
  document.querySelectorAll('[data-del-ann]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openConfirmModal({
        title: 'Delete Announcement',
        message: `Remove "${btn.dataset.delAnnTitle}"?`,
        confirmLabel: 'Delete',
        danger: true,
        onConfirm: () => deleteAnnouncementById(btn.dataset.delAnn),
      });
    });
  });
}

// 3. PROJECTS
function renderProjectsView() {
  const list = db.projects.filter((p) => {
    if (filters.projectStatus !== 'All' && p.status !== filters.projectStatus) return false;
    if (filters.projectSearch && !p.name.toLowerCase().includes(filters.projectSearch.toLowerCase())) return false;
    return true;
  });

  return `
    <div class="space-y-5 animate-in">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <input id="proj-search" type="text" value="${escapeHtml(filters.projectSearch)}" placeholder="Filter projects..."
            class="bg-[#0f1014] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-zinc-100 outline-none" />
          <select id="proj-status-filter" class="bg-[#0f1014] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-zinc-200">
            <option value="All">All Statuses</option>
            ${PROJECT_STATUSES.map((s) => `<option ${filters.projectStatus === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <button type="button" onclick="openProjectModal()" class="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs">+ New Project</button>
      </div>

      ${list.length
      ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${list
        .map((p) => {
          const pct = getProjectProgress(p);
          const ms = Array.isArray(p.milestones) ? p.milestones : [];
          return `
                  <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-5 flex flex-col justify-between gap-4">
                    <div>
                      <div class="flex items-start justify-between gap-2">
                        <div>
                          <h3 class="text-base font-semibold text-zinc-100">${escapeHtml(p.name)}</h3>
                          <p class="text-xs font-mono text-zinc-500 mt-0.5">${escapeHtml(p.engine || 'Unity')} · ${escapeHtml(p.status)}</p>
                        </div>
                        <div class="flex items-center gap-1.5">
                          <button type="button" onclick="openProjectModal('${p.id}')" class="px-2.5 py-1 rounded bg-[#14151a] border border-[#27272a] text-xs text-zinc-300">Edit</button>
                          ${isAdmin() ? `<button type="button" data-del-proj="${p.id}" data-del-proj-name="${escapeHtml(p.name)}" class="px-2 py-1 rounded bg-[#14151a] border border-[#27272a] text-xs text-red-400">Delete</button>` : ''}
                        </div>
                      </div>
                      ${p.gdd_summary ? `<p class="text-xs text-zinc-400 mt-3 leading-relaxed">${escapeHtml(p.gdd_summary)}</p>` : ''}
                      ${ms.length
              ? `<div class="mt-4 space-y-1.5">
                              <div class="text-[10px] font-mono uppercase text-zinc-500">Milestones</div>
                              ${ms
                .map(
                  (m, idx) => `
                                  <label class="flex items-center gap-2 text-xs cursor-pointer">
                                    <input type="checkbox" data-ms-proj="${p.id}" data-ms-idx="${idx}" ${m.done ? 'checked' : ''} class="rounded border-zinc-700 bg-zinc-900" />
                                    <span class="${m.done ? 'line-through text-zinc-500' : 'text-zinc-300'}">${escapeHtml(m.title)}</span>
                                  </label>`
                )
                .join('')}
                            </div>`
              : ''
            }
                    </div>
                    <div>
                      <div class="flex justify-between text-[11px] font-mono text-zinc-400 mb-1"><span>Progress</span><span>${pct}%</span></div>
                      <div class="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden"><div class="h-full bg-emerald-500 rounded-full" style="width:${pct}%"></div></div>
                      ${p.repo_url ? `<a href="${escapeHtml(safeUrl(p.repo_url))}" target="_blank" rel="noopener noreferrer" class="inline-block mt-3 text-xs text-emerald-400 hover:underline">Open Repo / Link ↗</a>` : ''}
                    </div>
                  </div>`;
        })
        .join('')}</div>`
      : `<div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-8 text-center text-xs text-zinc-500">No projects match your filter.</div>`
    }
    </div>
  `;
}

function bindProjectsEvents() {
  document.getElementById('proj-search')?.addEventListener('input', (e) => { filters.projectSearch = e.target.value; renderCurrentView(); });
  document.getElementById('proj-status-filter')?.addEventListener('change', (e) => { filters.projectStatus = e.target.value; renderCurrentView(); });
  document.querySelectorAll('[data-ms-proj]').forEach((cb) => {
    cb.addEventListener('change', async () => { await toggleProjectMilestone(cb.dataset.msProj, Number(cb.dataset.msIdx)); });
  });
  document.querySelectorAll('[data-del-proj]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openConfirmModal({
        title: 'Delete Project',
        message: `Delete "${btn.dataset.delProjName}" and all linked tasks, bugs, builds, and assets?`,
        confirmLabel: 'Delete',
        danger: true,
        onConfirm: () => deleteProject(btn.dataset.delProj, btn.dataset.delProjName),
      });
    });
  });
}

// 4. TASK BOARD
function renderBoardView() {
  const filtered = db.tasks.filter((t) => {
    if (filters.boardProject !== 'All' && t.project_id !== filters.boardProject) return false;
    if (filters.boardDiscipline !== 'All' && t.discipline !== filters.boardDiscipline) return false;
    if (filters.boardAssignee !== 'All' && t.assignee_id !== filters.boardAssignee) return false;
    if (filters.boardSearch && !t.title.toLowerCase().includes(filters.boardSearch.toLowerCase())) return false;
    return true;
  });

  return `
    <div class="space-y-4 animate-in">
      <div class="flex flex-wrap items-center justify-between gap-2.5 bg-[#0f1014] border border-[#27272a] rounded-xl p-3">
        <div class="flex flex-wrap items-center gap-2">
          <input id="board-search" type="text" value="${escapeHtml(filters.boardSearch)}" placeholder="Search tasks..."
            class="bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-zinc-100 outline-none" />
          <select id="board-proj" class="bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200">
            <option value="All">All Projects</option>
            ${db.projects.map((p) => `<option value="${p.id}" ${filters.boardProject === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
          <select id="board-disc" class="bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200">
            <option value="All">All Disciplines</option>
            ${TASK_DISCIPLINES.map((d) => `<option ${filters.boardDiscipline === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
          <select id="board-user" class="bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200">
            <option value="All">All Assignees</option>
            ${db.profiles.map((m) => `<option value="${m.id}" ${filters.boardAssignee === m.id ? 'selected' : ''}>${escapeHtml(m.display_name)}</option>`).join('')}
          </select>
        </div>
        <button type="button" onclick="openTaskModal()" class="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs">+ Add Task</button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        ${TASK_STATUSES.map((col) => {
    const colTasks = filtered.filter((t) => t.status === col);
    return `
            <div data-drop-col="${col}" class="bg-[#0f1014] border border-[#27272a] rounded-xl p-3.5 min-h-[360px] flex flex-col transition">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-semibold text-zinc-200">${col}</span>
                <span class="text-[11px] font-mono text-zinc-500">${colTasks.length}</span>
              </div>
              <div class="space-y-2.5 flex-1">
                ${colTasks
        .map((t) => {
          const proj = getProjectById(t.project_id);
          const assignee = getProfileById(t.assignee_id);
          const commentCount = db.comments.filter((c) => c.entity_type === 'task' && c.entity_id === t.id).length;
          return `
                      <div draggable="true" data-task-id="${t.id}" onclick="openTaskModal('${t.id}')"
                        class="p-3 rounded-lg bg-[#09090b] border border-[#27272a] hover:border-zinc-600 cursor-pointer transition">
                        <div class="flex items-center justify-between gap-2 mb-1.5">
                          <span class="text-[10px] font-mono text-emerald-400">${escapeHtml(t.discipline)}</span>
                          <span class="text-[10px] font-mono text-zinc-500">${escapeHtml(t.priority)}</span>
                        </div>
                        <div class="text-xs font-medium text-zinc-100 leading-snug">${escapeHtml(t.title)}</div>
                        <div class="flex items-center justify-between mt-2.5 text-[11px] text-zinc-500">
                          <span class="truncate">${escapeHtml(proj?.name || 'General')}${commentCount ? ` · 💬 ${commentCount}` : ''}</span>
                          <span class="font-mono text-zinc-400 shrink-0">${escapeHtml(assignee?.display_name || 'Unassigned')}</span>
                        </div>
                      </div>`;
        })
        .join('')}
              </div>
            </div>`;
  }).join('')}
      </div>
    </div>
  `;
}

function bindBoardEvents() {
  document.getElementById('board-search')?.addEventListener('input', (e) => { filters.boardSearch = e.target.value; renderCurrentView(); });
  document.getElementById('board-proj')?.addEventListener('change', (e) => { filters.boardProject = e.target.value; renderCurrentView(); });
  document.getElementById('board-disc')?.addEventListener('change', (e) => { filters.boardDiscipline = e.target.value; renderCurrentView(); });
  document.getElementById('board-user')?.addEventListener('change', (e) => { filters.boardAssignee = e.target.value; renderCurrentView(); });

  document.querySelectorAll('[data-task-id]').forEach((card) => {
    card.addEventListener('dragstart', () => { draggedTaskId = card.dataset.taskId; card.classList.add('kanban-card-dragging'); });
    card.addEventListener('dragend', () => {
      draggedTaskId = null;
      card.classList.remove('kanban-card-dragging');
      document.querySelectorAll('[data-drop-col]').forEach((c) => c.classList.remove('kanban-drop-active'));
    });
  });

  document.querySelectorAll('[data-drop-col]').forEach((colEl) => {
    colEl.addEventListener('dragover', (e) => { e.preventDefault(); colEl.classList.add('kanban-drop-active'); });
    colEl.addEventListener('dragleave', () => colEl.classList.remove('kanban-drop-active'));
    colEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      colEl.classList.remove('kanban-drop-active');
      if (draggedTaskId) await updateTaskStatus(draggedTaskId, colEl.dataset.dropCol);
    });
  });
}

// 5. BUG TRACKER
function renderBugsView() {
  const list = db.bugs.filter((b) => {
    if (filters.bugProject !== 'All' && b.project_id !== filters.bugProject) return false;
    if (filters.bugSeverity !== 'All' && b.severity !== filters.bugSeverity) return false;
    if (filters.bugStatus !== 'All' && b.status !== filters.bugStatus) return false;
    if (filters.bugSearch && !b.title.toLowerCase().includes(filters.bugSearch.toLowerCase())) return false;
    return true;
  });

  return `
    <div class="space-y-4 animate-in">
      <div class="flex flex-wrap items-center justify-between gap-2.5 bg-[#0f1014] border border-[#27272a] rounded-xl p-3">
        <div class="flex flex-wrap items-center gap-2">
          <input id="bug-search" type="text" value="${escapeHtml(filters.bugSearch)}" placeholder="Search bugs..."
            class="bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-zinc-100 outline-none" />
          <select id="bug-sev" class="bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200">
            <option value="All">All Severities</option>
            ${BUG_SEVERITIES.map((s) => `<option ${filters.bugSeverity === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <select id="bug-status" class="bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200">
            <option value="All">All Statuses</option>
            ${BUG_STATUSES.map((st) => `<option ${filters.bugStatus === st ? 'selected' : ''}>${st}</option>`).join('')}
          </select>
        </div>
        <button type="button" onclick="openBugModal()" class="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs">+ Log Bug</button>
      </div>

      <div class="bg-[#0f1014] border border-[#27272a] rounded-xl overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-[#27272a] text-[11px] font-mono text-zinc-500 uppercase">
              <th class="py-3 px-4">Bug</th>
              <th class="py-3 px-4">Project</th>
              <th class="py-3 px-4">Severity</th>
              <th class="py-3 px-4">Build</th>
              <th class="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#27272a] text-xs">
            ${list.length
      ? list
        .map((b) => {
          const proj = getProjectById(b.project_id);
          const cCount = db.comments.filter((c) => c.entity_type === 'bug' && c.entity_id === b.id).length;
          return `
                        <tr class="hover:bg-[#14151a]/70">
                          <td class="py-3 px-4">
                            <button type="button" onclick="openBugModal('${b.id}')" class="font-medium text-zinc-100 hover:text-emerald-400 text-left">
                              ${escapeHtml(b.title)}
                              ${b.media_path ? `<span class="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-mono">Media</span>` : ''}
                              ${cCount ? `<span class="ml-1 text-[10px] text-zinc-500">💬 ${cCount}</span>` : ''}
                            </button>
                          </td>
                          <td class="py-3 px-4 text-zinc-400">${escapeHtml(proj?.name || 'General')}</td>
                          <td class="py-3 px-4 font-mono text-zinc-300">${escapeHtml(b.severity)}</td>
                          <td class="py-3 px-4 font-mono text-zinc-400">${escapeHtml(b.build_version || '-')}</td>
                          <td class="py-3 px-4">
                            <select data-bug-status-id="${b.id}" class="bg-[#09090b] border border-[#27272a] rounded px-2 py-1 text-xs text-zinc-200">
                              ${BUG_STATUSES.map((st) => `<option ${b.status === st ? 'selected' : ''}>${st}</option>`).join('')}
                            </select>
                          </td>
                        </tr>`;
        })
        .join('')
      : `<tr><td colspan="5" class="py-8 text-center text-zinc-500">No bugs logged yet.</td></tr>`
    }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function bindBugsEvents() {
  document.getElementById('bug-search')?.addEventListener('input', (e) => { filters.bugSearch = e.target.value; renderCurrentView(); });
  document.getElementById('bug-sev')?.addEventListener('change', (e) => { filters.bugSeverity = e.target.value; renderCurrentView(); });
  document.getElementById('bug-status')?.addEventListener('change', (e) => { filters.bugStatus = e.target.value; renderCurrentView(); });
  document.querySelectorAll('[data-bug-status-id]').forEach((sel) => {
    sel.addEventListener('change', async (e) => { await updateBugStatus(e.target.dataset.bugStatusId, e.target.value); });
  });
}

// 6. BUILDS & DOCS
function renderBuildsDocsView() {
  const isBuilds = filters.buildsTab === 'builds';
  return `
    <div class="space-y-5 animate-in">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <button type="button" onclick="filters.buildsTab='builds';renderCurrentView()"
            class="px-3.5 py-1.5 rounded-lg text-xs font-medium border ${isBuilds ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300' : 'bg-[#0f1014] border-[#27272a] text-zinc-400'}">
            Playable Builds (${db.builds.length})
          </button>
          <button type="button" onclick="filters.buildsTab='docs';renderCurrentView()"
            class="px-3.5 py-1.5 rounded-lg text-xs font-medium border ${!isBuilds ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300' : 'bg-[#0f1014] border-[#27272a] text-zinc-400'}">
            Docs &amp; Links (${db.docs.length})
          </button>
        </div>
        <button type="button" onclick="${isBuilds ? 'openBuildModal()' : 'openDocModal()'}"
          class="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs">
          ${isBuilds ? '+ Log Build' : '+ Add Doc'}
        </button>
      </div>

      ${isBuilds
      ? db.builds.length
        ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${db.builds
          .map((b) => {
            const proj = getProjectById(b.project_id);
            return `
                    <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-4 space-y-2.5">
                      <div class="flex items-center justify-between gap-2">
                        <div>
                          <span class="text-sm font-mono font-semibold text-emerald-400">${escapeHtml(b.version)}</span>
                          <span class="text-xs text-zinc-400 ml-2">${escapeHtml(proj?.name || 'General')} · ${escapeHtml(b.platform)}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                          <button type="button" onclick="copyBuildUrl('${b.id}')" class="px-2 py-1 rounded bg-[#14151a] border border-[#27272a] text-[11px] text-zinc-300">Copy Link</button>
                          <button type="button" onclick="deleteBuildById('${b.id}')" class="px-2 py-1 rounded bg-[#14151a] border border-[#27272a] text-[11px] text-red-400">Delete</button>
                        </div>
                      </div>
                      ${b.changelog ? `<p class="text-xs text-zinc-400 leading-relaxed">${escapeHtml(b.changelog)}</p>` : ''}
                      <a href="${escapeHtml(safeUrl(b.download_url))}" target="_blank" rel="noopener noreferrer" class="inline-block text-xs text-emerald-400 hover:underline">Download Build ↗</a>
                    </div>`;
          })
          .join('')}</div>`
        : `<div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-8 text-center text-xs text-zinc-500">No builds logged yet.</div>`
      : db.docs.length
        ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${db.docs
          .map((d) => {
            const proj = getProjectById(d.project_id);
            return `
                  <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-4 space-y-2">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs font-mono text-emerald-400">${escapeHtml(d.category)} · ${escapeHtml(proj?.name || 'Studio')}</span>
                      <button type="button" onclick="deleteDocById('${d.id}')" class="text-[11px] text-red-400 hover:underline">Delete</button>
                    </div>
                    <div class="text-sm font-semibold text-zinc-100">${escapeHtml(d.title)}</div>
                    ${d.notes ? `<p class="text-xs text-zinc-400">${escapeHtml(d.notes)}</p>` : ''}
                    <a href="${escapeHtml(safeUrl(d.url))}" target="_blank" rel="noopener noreferrer" class="inline-block text-xs text-emerald-400 hover:underline">Open Resource ↗</a>
                  </div>`;
          })
          .join('')}</div>`
        : `<div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-8 text-center text-xs text-zinc-500">No docs or links added yet.</div>`
    }
    </div>
  `;
}

// 7. ASSETS PIPELINE (NESTED FOLDERS + INLINE PREVIEWER)
function renderAssetsView() {
  const used = Number(db.storage?.used_bytes) || 0;
  const max = Number(db.storage?.max_bytes) || MAX_STORAGE_BYTES;
  const pct = Math.min(100, Math.round((used / max) * 1000) / 10);
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-emerald-500';

  const isSearching = Boolean(filters.assetSearch.trim() || filters.assetType !== 'All' || filters.assetStatus !== 'All');
  const breadcrumbs = getFolderBreadcrumbChain(filters.currentFolderId);
  const currentFolder = filters.currentFolderId ? getFolderById(filters.currentFolderId) : null;

  // Subfolders inside current folder (hidden during global search)
  const visibleFolders = isSearching
    ? []
    : db.asset_folders.filter((f) => {
      if (filters.currentFolderId) return f.parent_id === filters.currentFolderId;
      if (f.parent_id !== null) return false;
      if (filters.assetProject !== 'All' && f.project_id !== filters.assetProject) return false;
      return true;
    });

  // Assets inside current folder (or matching global search)
  const visibleAssets = db.assets.filter((a) => {
    if (filters.assetProject !== 'All' && a.project_id !== filters.assetProject) return false;
    if (filters.assetType !== 'All' && a.asset_type !== filters.assetType) return false;
    if (filters.assetStatus !== 'All' && a.status !== filters.assetStatus) return false;
    if (filters.assetSearch && !a.name.toLowerCase().includes(filters.assetSearch.toLowerCase())) return false;
    if (!isSearching) {
      return (a.folder_id || null) === (filters.currentFolderId || null);
    }
    return true;
  });

  return `
    <div class="space-y-4 animate-in">
      <!-- Storage Meter & Actions -->
      <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="space-y-1 flex-1">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-zinc-100">Supabase Studio Storage (${db.storage.file_count} files)</span>
            <span class="font-mono text-emerald-400">${formatBytes(used)} / ${formatBytes(max)} (${pct}%)</span>
          </div>
          <div class="w-full h-2 rounded-full bg-zinc-900 overflow-hidden"><div class="h-full ${barColor} rounded-full transition-all" style="width:${pct}%"></div></div>
          <p class="text-[11px] text-zinc-500">Preview .glb/.gltf 3D models, images, audio, PDFs &amp; scripts inline. Max upload: 50 MB.</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" onclick="openFolderModal(${filters.currentFolderId ? `'${filters.currentFolderId}'` : 'null'})"
            class="px-3 py-2 rounded-lg bg-[#14151a] hover:bg-zinc-800 border border-[#27272a] text-zinc-200 font-medium text-xs">
            + New Folder
          </button>
          <button type="button" onclick="openAssetModal()"
            class="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs">
            + Upload Asset
          </button>
        </div>
      </div>

      <!-- Filters & Breadcrumbs -->
      <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-3 space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <input id="asset-search" type="text" value="${escapeHtml(filters.assetSearch)}" placeholder="Search all assets..."
            class="bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-zinc-100 outline-none" />
          <select id="asset-proj" class="bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200">
            <option value="All">All Projects</option>
            ${db.projects.map((p) => `<option value="${p.id}" ${filters.assetProject === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
          <select id="asset-type" class="bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200">
            <option value="All">All Types</option>
            ${ASSET_TYPES.map((t) => `<option ${filters.assetType === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
          <select id="asset-status" class="bg-[#09090b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200">
            <option value="All">All Stages</option>
            ${ASSET_STATUSES.map((s) => `<option ${filters.assetStatus === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>

        <!-- Folder Breadcrumb Bar -->
        <div class="flex flex-wrap items-center gap-1.5 text-xs pt-2 border-t border-[#27272a]">
          ${currentFolder
      ? `<button type="button" onclick="enterFolder(${currentFolder.parent_id ? `'${currentFolder.parent_id}'` : 'null'})" class="px-2 py-1 rounded bg-[#14151a] border border-[#27272a] text-zinc-300 hover:text-white mr-1">↑ Up</button>`
      : ''
    }
          <button type="button" onclick="enterFolder(null)" class="px-2 py-0.5 rounded hover:bg-[#14151a] ${!filters.currentFolderId ? 'text-emerald-400 font-semibold' : 'text-zinc-400'}">
            Root
          </button>
          ${breadcrumbs
      .map(
        (f, idx) => `
              <span class="text-zinc-600">/</span>
              <button type="button" onclick="enterFolder('${f.id}')" class="px-2 py-0.5 rounded hover:bg-[#14151a] ${idx === breadcrumbs.length - 1 ? 'text-emerald-400 font-semibold' : 'text-zinc-300'}">
                ${escapeHtml(f.name)}
              </button>`
      )
      .join('')}
          ${isSearching ? `<span class="ml-auto text-[11px] font-mono text-amber-400">Showing filtered matches across all folders</span>` : ''}
        </div>
      </div>

      <!-- Nested Folders Grid -->
      ${visibleFolders.length
      ? `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">${visibleFolders
        .map((fl) => {
          const proj = getProjectById(fl.project_id);
          const childFolderCount = db.asset_folders.filter((x) => x.parent_id === fl.id).length;
          const fileCount = db.assets.filter((x) => x.folder_id === fl.id).length;
          return `
                  <div class="group bg-[#0f1014] hover:bg-[#14151a] border border-[#27272a] hover:border-emerald-500/40 rounded-xl p-3.5 transition flex flex-col justify-between gap-2.5">
                    <button type="button" onclick="enterFolder('${fl.id}')" class="text-left flex items-start gap-2.5 w-full">
                      <i data-lucide="folder" class="w-5 h-5 text-emerald-400 shrink-0 mt-0.5"></i>
                      <div class="min-w-0">
                        <div class="text-sm font-medium text-zinc-100 truncate group-hover:text-emerald-300">${escapeHtml(fl.name)}</div>
                        <div class="text-[11px] font-mono text-zinc-500 truncate">${escapeHtml(proj?.name || 'General')} · ${childFolderCount}d / ${fileCount}f</div>
                      </div>
                    </button>
                    <div class="flex items-center justify-end gap-2 text-[11px] pt-1 border-t border-[#27272a]/70">
                      <button type="button" onclick="openFolderModal(null, '${fl.id}')" class="text-zinc-400 hover:text-zinc-200">Rename</button>
                      <button type="button" data-del-folder="${fl.id}" data-del-folder-name="${escapeHtml(fl.name)}" class="text-red-400 hover:underline">Delete</button>
                    </div>
                  </div>`;
        })
        .join('')}</div>`
      : ''
    }

      <!-- Asset Cards Grid -->
      ${visibleAssets.length
      ? `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${visibleAssets
        .map((a) => {
          const proj = getProjectById(a.project_id);
          const uploader = getProfileById(a.uploader_id);
          const previewable = a.file_path && canPreviewFile(a.file_name || a.name);
          return `
                  <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-4 flex flex-col justify-between gap-3">
                    <div>
                      <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                          <div class="text-xs font-mono text-emerald-400">${escapeHtml(a.asset_type)} · ${escapeHtml(proj?.name || 'General')}</div>
                          <div class="text-sm font-semibold text-zinc-100 truncate mt-0.5">${escapeHtml(a.name)}</div>
                          ${isSearching && a.folder_id ? `<div class="text-[10px] font-mono text-zinc-500 truncate mt-0.5">📁 ${escapeHtml(getFolderPathLabel(a.folder_id))}</div>` : ''}
                        </div>
                        <select data-asset-status-id="${a.id}" class="bg-[#09090b] border border-[#27272a] rounded px-2 py-1 text-[11px] text-zinc-200">
                          ${ASSET_STATUSES.map((st) => `<option ${a.status === st ? 'selected' : ''}>${st}</option>`).join('')}
                        </select>
                      </div>
                      ${a.notes ? `<p class="text-xs text-zinc-400 mt-2 leading-relaxed">${escapeHtml(a.notes)}</p>` : ''}
                    </div>
                    <div class="pt-3 border-t border-[#27272a] flex items-center justify-between gap-2 text-[11px]">
                      <span class="font-mono text-zinc-500 truncate">${a.file_path ? formatBytes(a.file_size) : a.external_url ? 'External Link' : 'Metadata'} · ${escapeHtml(uploader?.display_name || '')}</span>
                      <div class="flex items-center gap-1.5 shrink-0">
                        ${a.file_path
              ? `<button type="button" onclick="openAssetViewer('${a.id}')" class="px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 font-medium">${previewable ? 'Preview' : 'Inspect'}</button>`
              : a.external_url
                ? `<button type="button" onclick="downloadAssetById('${a.id}')" class="px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">Open ↗</button>`
                : ''
            }
                        <button type="button" onclick="openAssetModal('${a.id}')" class="px-2 py-1 rounded bg-[#14151a] border border-[#27272a] text-zinc-300">Edit</button>
                        <button type="button" data-del-asset="${a.id}" data-del-asset-name="${escapeHtml(a.name)}" class="px-2 py-1 rounded bg-[#14151a] border border-[#27272a] text-red-400">Delete</button>
                      </div>
                    </div>
                  </div>`;
        })
        .join('')}</div>`
      : !visibleFolders.length
        ? `<div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-8 text-center text-xs text-zinc-500">This folder is empty. Create a subfolder or upload an asset above.</div>`
        : ''
    }
    </div>
  `;
}

function bindAssetsEvents() {
  document.getElementById('asset-search')?.addEventListener('input', (e) => { filters.assetSearch = e.target.value; renderCurrentView(); });
  document.getElementById('asset-proj')?.addEventListener('change', (e) => {
    filters.assetProject = e.target.value;
    filters.currentFolderId = null;
    renderCurrentView();
  });
  document.getElementById('asset-type')?.addEventListener('change', (e) => { filters.assetType = e.target.value; renderCurrentView(); });
  document.getElementById('asset-status')?.addEventListener('change', (e) => { filters.assetStatus = e.target.value; renderCurrentView(); });

  document.querySelectorAll('[data-asset-status-id]').forEach((sel) => {
    sel.addEventListener('change', async (e) => { await updateAssetStatus(e.target.dataset.assetStatusId, e.target.value); });
  });
  document.querySelectorAll('[data-del-folder]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openConfirmModal({
        title: 'Delete Folder',
        message: `Delete folder "${btn.dataset.delFolderName}" and any empty subfolders? Uploaded assets inside will stay safe at Root.`,
        confirmLabel: 'Delete Folder',
        danger: true,
        onConfirm: () => deleteAssetFolder(btn.dataset.delFolder),
      });
    });
  });
  document.querySelectorAll('[data-del-asset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openConfirmModal({
        title: 'Delete Asset',
        message: `Delete "${btn.dataset.delAssetName}" and remove its file from storage?`,
        confirmLabel: 'Delete',
        danger: true,
        onConfirm: () => deleteAssetById(btn.dataset.delAsset),
      });
    });
  });
}

// 8. TEAM & ACCESS (ROSTER + WHITELIST + DISCORD CHANNELS)
function renderTeamView() {
  return `
    <div class="space-y-5 animate-in">
      <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-5">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-sm font-semibold text-zinc-100">Reptile Studio Roster (${db.profiles.length})</h3>
            <p class="text-xs text-zinc-500 mt-0.5">Active members with portal access.</p>
          </div>
          <button type="button" onclick="openEditProfileModal(currentProfile.id)" class="px-3 py-1.5 rounded-lg bg-[#14151a] border border-[#27272a] text-xs text-zinc-200 hover:bg-zinc-800">
            Edit My Profile
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          ${db.profiles
      .map(
        (m) => `
              <div class="p-4 rounded-xl bg-[#09090b] border border-[#27272a] flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-semibold flex items-center justify-center shrink-0">
                    ${escapeHtml(getInitials(m.display_name))}
                  </div>
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-zinc-100 truncate">${escapeHtml(m.display_name)} <span class="text-[10px] font-mono text-emerald-400">${escapeHtml(m.access_role)}</span></div>
                    <div class="text-xs text-zinc-500 truncate">${escapeHtml(m.studio_title)} · @${escapeHtml(m.username)}</div>
                  </div>
                </div>
                <button type="button" onclick="openEditProfileModal('${m.id}')" class="text-xs text-zinc-400 hover:text-emerald-400">Edit</button>
              </div>`
      )
      .join('')}
        </div>
      </div>

      ${isAdmin()
      ? `
          <!-- Discord Multi-Channel Webhook Manager -->
          <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-5 space-y-4">
            <div>
              <h3 class="text-sm font-semibold text-zinc-100">Discord Channel Notifications (Admin Only)</h3>
              <p class="text-xs text-zinc-500 mt-0.5">
                Paste a separate Discord Webhook URL for each channel. URLs stay encrypted in Supabase and fire automatically on updates.
              </p>
            </div>
            <div class="space-y-3">
              ${db.discord_webhooks
        .map(
          (wh) => `
                  <form data-wh-form="${escapeHtml(wh.channel_key)}" class="p-3.5 rounded-lg bg-[#09090b] border border-[#27272a] space-y-2.5">
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-xs font-semibold text-zinc-200">${escapeHtml(wh.label)} <span class="font-mono text-[10px] text-zinc-500">(${escapeHtml(wh.channel_key)})</span></div>
                      <label class="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                        <input type="checkbox" name="enabled" ${wh.enabled ? 'checked' : ''} class="rounded border-zinc-700 bg-zinc-900" />
                        Enabled
                      </label>
                    </div>
                    <div class="flex flex-col sm:flex-row gap-2">
                      <input type="url" name="webhook_url" value="${escapeHtml(wh.webhook_url || '')}" placeholder="https://discord.com/api/webhooks/..."
                        class="flex-1 bg-[#0f1014] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 outline-none" />
                      <div class="flex gap-2 shrink-0">
                        <button type="submit" class="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs">Save</button>
                        <button type="button" onclick="runTestDiscordWebhook('${escapeHtml(wh.channel_key)}')" class="px-3 py-1.5 rounded-lg bg-[#14151a] hover:bg-zinc-800 border border-[#27272a] text-xs text-zinc-300">Test</button>
                      </div>
                    </div>
                  </form>`
        )
        .join('')}
            </div>
          </div>

          <!-- Allowed Emails Whitelist -->
          <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-5 space-y-4">
            <div>
              <h3 class="text-sm font-semibold text-zinc-100">Allowed Emails Whitelist (Admin Only)</h3>
              <p class="text-xs text-zinc-500 mt-0.5">Only Google/Discord emails listed here can sign in for the first time.</p>
            </div>
            <form id="whitelist-add-form" class="flex gap-2">
              <input id="whitelist-email-input" type="email" required placeholder="teammate@gmail.com"
                class="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none" />
              <button type="submit" class="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs">Add Email</button>
            </form>
            <div class="divide-y divide-[#27272a] border border-[#27272a] rounded-lg overflow-hidden">
              ${db.allowed_emails
        .map(
          (row) => `
                  <div class="px-3.5 py-2.5 bg-[#09090b] flex items-center justify-between text-xs">
                    <span class="font-mono text-zinc-200">${escapeHtml(row.email)}</span>
                    <button type="button" data-remove-wl="${escapeHtml(row.email)}" class="text-red-400 hover:underline text-[11px]">Remove</button>
                  </div>`
        )
        .join('')}
            </div>
          </div>`
      : ''
    }
    </div>
  `;
}

function bindTeamEvents() {
  document.querySelectorAll('[data-wh-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveDiscordWebhook(form.dataset.whForm, form.webhook_url.value, form.enabled.checked);
    });
  });

  document.getElementById('whitelist-add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('whitelist-email-input');
    const val = input.value.trim();
    if (!val) return;
    input.value = '';
    await addWhitelistEmail(val);
  });

  document.querySelectorAll('[data-remove-wl]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const email = btn.dataset.removeWl;
      openConfirmModal({
        title: 'Remove Whitelisted Email',
        message: `Remove ${email} from allowed_emails?`,
        confirmLabel: 'Remove',
        danger: true,
        onConfirm: () => removeWhitelistEmail(email),
      });
    });
  });
}