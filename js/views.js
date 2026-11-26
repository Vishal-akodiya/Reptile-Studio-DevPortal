function getProjectProgress(project) {
    const pTasks = db.tasks.filter((t) => t.project_id === project.id);
    if (pTasks.length > 0) {
        const done = pTasks.filter((t) => t.status === 'Done').length;
        return Math.round((done / pTasks.length) * 100);
    }
    const ms = Array.isArray(project.milestones) ? project.milestones : [];
    if (ms.length > 0) {
        const done = ms.filter((m) => m.done).length;
        return Math.round((done / ms.length) * 100);
    }
    return 0;
}

function renderCurrentView() {
    const main = document.getElementById('main-content');
    if (!main || !currentProfile) return;

    switch (currentView) {
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
        case 'team':
            main.innerHTML = renderTeamView();
            break;
        case 'overview':
        default:
            main.innerHTML = renderOverviewView();
            bindOverviewEvents();
            break;
    }
    refreshIcons();
}

// 1. OVERVIEW
function renderOverviewView() {
    const openTasks = db.tasks.filter((t) => t.status !== 'Done').length;
    const openBugs = db.bugs.filter((b) => b.status === 'Open' || b.status === 'In Progress').length;
    const blockers = db.bugs.filter((b) => b.severity === 'Blocker' && b.status !== 'Fixed' && b.status !== 'Closed').length;

    const myTasks = db.tasks.filter((t) => {
        if (t.assignee_id !== currentProfile.id) return false;
        return filters.myTasksShowDone ? true : t.status !== 'Done';
    });

    return `
    <div class="space-y-6 animate-in">
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
          <div class="text-[11px] font-mono text-zinc-500 uppercase">Blockers</div>
          <div class="text-2xl font-semibold ${blockers > 0 ? 'text-red-400' : 'text-zinc-300'} mt-1">${blockers}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <!-- Projects Progress -->
        <div class="lg:col-span-2 space-y-5">
          <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold text-zinc-100">Active Projects</h3>
              <button type="button" onclick="openProjectModal()" class="text-xs text-emerald-400 hover:text-emerald-300 font-medium">+ Add Project</button>
            </div>
            ${db.projects.length
            ? `<div class="space-y-3.5">
                    ${db.projects
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
                            <div class="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                              <div class="h-full bg-emerald-500 rounded-full transition-all" style="width:${pct}%"></div>
                            </div>
                          </div>`;
                })
                .join('')}
                  </div>`
            : `<p class="text-xs text-zinc-500">No projects yet. Click "+ Add Project" to create your first game.</p>`
        }
          </div>

          <!-- My Assigned Tasks -->
          <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-zinc-100">My Tasks (${escapeHtml(currentProfile.display_name)})</h3>
              <label class="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                <input id="my-tasks-done-toggle" type="checkbox" ${filters.myTasksShowDone ? 'checked' : ''} class="rounded border-zinc-700 bg-zinc-900" />
                Show Done
              </label>
            </div>
            ${myTasks.length
            ? `<div class="divide-y divide-[#27272a]">
                    ${myTasks
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
                .join('')}
                  </div>`
            : `<p class="text-xs text-zinc-500">No assigned tasks matching this filter.</p>`
        }
          </div>
        </div>

        <!-- Live Activity Feed -->
        <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-5">
          <h3 class="text-sm font-semibold text-zinc-100 mb-3">Studio Activity</h3>
          ${db.activity_logs.length
            ? `<div class="space-y-3">
                  ${db.activity_logs
                .slice(0, 14)
                .map(
                    (a) => `
                      <div class="text-xs border-b border-[#27272a]/70 pb-2.5 last:border-none">
                        <span class="font-medium text-emerald-400">${escapeHtml(a.actor_name)}</span>
                        <span class="text-zinc-400"> ${escapeHtml(a.action)}</span>
                        <span class="text-zinc-200 font-medium"> "${escapeHtml(a.target)}"</span>
                      </div>`
                )
                .join('')}
                </div>`
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
            const nextStatus = e.target.checked ? 'Done' : 'In Progress';
            await updateTaskStatus(e.target.dataset.quickTaskId, nextStatus);
        });
    });
}

// 2. PROJECTS
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
        <button type="button" onclick="openProjectModal()" class="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs">
          + New Project
        </button>
      </div>

      ${list.length
            ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${list
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
                            <button type="button" onclick="openProjectModal('${p.id}')" class="px-2.5 py-1 rounded bg-[#14151a] border border-[#27272a] text-xs text-zinc-300 hover:text-white">Edit</button>
                            <button type="button" data-del-proj="${p.id}" data-del-proj-name="${escapeHtml(p.name)}" class="px-2 py-1 rounded bg-[#14151a] border border-[#27272a] text-xs text-red-400 hover:bg-red-500/10">Delete</button>
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
                        <div class="flex justify-between text-[11px] font-mono text-zinc-400 mb-1">
                          <span>Progress</span>
                          <span>${pct}%</span>
                        </div>
                        <div class="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                          <div class="h-full bg-emerald-500 rounded-full" style="width:${pct}%"></div>
                        </div>
                        ${p.repo_url
                            ? `<a href="${escapeHtml(safeUrl(p.repo_url))}" target="_blank" rel="noopener noreferrer" class="inline-block mt-3 text-xs text-emerald-400 hover:underline">Open Repo / Link ↗</a>`
                            : ''
                        }
                      </div>
                    </div>`;
                })
                .join('')}
            </div>`
            : `<div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-8 text-center text-xs text-zinc-500">No projects match your filter.</div>`
        }
    </div>
  `;
}

function bindProjectsEvents() {
    document.getElementById('proj-search')?.addEventListener('input', (e) => {
        filters.projectSearch = e.target.value;
        renderCurrentView();
    });
    document.getElementById('proj-status-filter')?.addEventListener('change', (e) => {
        filters.projectStatus = e.target.value;
        renderCurrentView();
    });
    document.querySelectorAll('[data-ms-proj]').forEach((cb) => {
        cb.addEventListener('change', async () => {
            await toggleProjectMilestone(cb.dataset.msProj, Number(cb.dataset.msIdx));
        });
    });
    document.querySelectorAll('[data-del-proj]').forEach((btn) => {
        btn.addEventListener('click', () => {
            openConfirmModal({
                title: 'Delete Project',
                message: `Delete "${btn.dataset.delProjName}" and its tasks/bugs/builds?`,
                confirmLabel: 'Delete',
                danger: true,
                onConfirm: () => deleteProject(btn.dataset.delProj, btn.dataset.delProjName),
            });
        });
    });
}

// 3. TASK BOARD
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
        <button type="button" onclick="openTaskModal()" class="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs">
          + Add Task
        </button>
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
                    return `
                      <div draggable="true" data-task-id="${t.id}" onclick="openTaskModal('${t.id}')"
                        class="p-3 rounded-lg bg-[#09090b] border border-[#27272a] hover:border-zinc-600 cursor-pointer transition">
                        <div class="flex items-center justify-between gap-2 mb-1.5">
                          <span class="text-[10px] font-mono text-emerald-400">${escapeHtml(t.discipline)}</span>
                          <span class="text-[10px] font-mono text-zinc-500">${escapeHtml(t.priority)}</span>
                        </div>
                        <div class="text-xs font-medium text-zinc-100 leading-snug">${escapeHtml(t.title)}</div>
                        <div class="flex items-center justify-between mt-2.5 text-[11px] text-zinc-500">
                          <span class="truncate">${escapeHtml(proj?.name || 'General')}</span>
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
    document.getElementById('board-search')?.addEventListener('input', (e) => {
        filters.boardSearch = e.target.value;
        renderCurrentView();
    });
    document.getElementById('board-proj')?.addEventListener('change', (e) => {
        filters.boardProject = e.target.value;
        renderCurrentView();
    });
    document.getElementById('board-disc')?.addEventListener('change', (e) => {
        filters.boardDiscipline = e.target.value;
        renderCurrentView();
    });
    document.getElementById('board-user')?.addEventListener('change', (e) => {
        filters.boardAssignee = e.target.value;
        renderCurrentView();
    });

    document.querySelectorAll('[data-task-id]').forEach((card) => {
        card.addEventListener('dragstart', () => {
            draggedTaskId = card.dataset.taskId;
            card.classList.add('kanban-card-dragging');
        });
        card.addEventListener('dragend', () => {
            draggedTaskId = null;
            card.classList.remove('kanban-card-dragging');
            document.querySelectorAll('[data-drop-col]').forEach((c) => c.classList.remove('kanban-drop-active'));
        });
    });

    document.querySelectorAll('[data-drop-col]').forEach((colEl) => {
        colEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            colEl.classList.add('kanban-drop-active');
        });
        colEl.addEventListener('dragleave', () => colEl.classList.remove('kanban-drop-active'));
        colEl.addEventListener('drop', async (e) => {
            e.preventDefault();
            colEl.classList.remove('kanban-drop-active');
            if (draggedTaskId) {
                await updateTaskStatus(draggedTaskId, colEl.dataset.dropCol);
            }
        });
    });
}

// 4. BUG TRACKER
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
        <button type="button" onclick="openBugModal()" class="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs">
          + Log Bug
        </button>
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
                    return `
                        <tr class="hover:bg-[#14151a]/70">
                          <td class="py-3 px-4">
                            <button type="button" onclick="openBugModal('${b.id}')" class="font-medium text-zinc-100 hover:text-emerald-400 text-left">
                              ${escapeHtml(b.title)}
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
    document.getElementById('bug-search')?.addEventListener('input', (e) => {
        filters.bugSearch = e.target.value;
        renderCurrentView();
    });
    document.getElementById('bug-sev')?.addEventListener('change', (e) => {
        filters.bugSeverity = e.target.value;
        renderCurrentView();
    });
    document.getElementById('bug-status')?.addEventListener('change', (e) => {
        filters.bugStatus = e.target.value;
        renderCurrentView();
    });
    document.querySelectorAll('[data-bug-status-id]').forEach((sel) => {
        sel.addEventListener('change', async (e) => {
            await updateBugStatus(e.target.dataset.bugStatusId, e.target.value);
        });
    });
}

// 5. BUILDS & DOCS
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
                ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${db.builds
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
                            <button type="button" onclick="copyText('${escapeHtml(b.download_url)}', 'Build link copied')" class="px-2 py-1 rounded bg-[#14151a] border border-[#27272a] text-[11px] text-zinc-300">Copy Link</button>
                            <button type="button" onclick="deleteBuild('${b.id}', '${escapeHtml(b.version)}')" class="px-2 py-1 rounded bg-[#14151a] border border-[#27272a] text-[11px] text-red-400">Delete</button>
                          </div>
                        </div>
                        ${b.changelog ? `<p class="text-xs text-zinc-400 leading-relaxed">${escapeHtml(b.changelog)}</p>` : ''}
                        <a href="${escapeHtml(safeUrl(b.download_url))}" target="_blank" rel="noopener noreferrer" class="inline-block text-xs text-emerald-400 hover:underline">Download Build ↗</a>
                      </div>`;
                    })
                    .join('')}
              </div>`
                : `<div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-8 text-center text-xs text-zinc-500">No builds logged yet.</div>`
            : db.docs.length
                ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${db.docs
                    .map((d) => {
                        const proj = getProjectById(d.project_id);
                        return `
                    <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-4 space-y-2">
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-xs font-mono text-emerald-400">${escapeHtml(d.category)} · ${escapeHtml(proj?.name || 'Studio')}</span>
                        <button type="button" onclick="deleteDoc('${d.id}', '${escapeHtml(d.title)}')" class="text-[11px] text-red-400 hover:underline">Delete</button>
                      </div>
                      <div class="text-sm font-semibold text-zinc-100">${escapeHtml(d.title)}</div>
                      ${d.notes ? `<p class="text-xs text-zinc-400">${escapeHtml(d.notes)}</p>` : ''}
                      <a href="${escapeHtml(safeUrl(d.url))}" target="_blank" rel="noopener noreferrer" class="inline-block text-xs text-emerald-400 hover:underline">Open Resource ↗</a>
                    </div>`;
                    })
                    .join('')}
            </div>`
                : `<div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-8 text-center text-xs text-zinc-500">No docs or links added yet.</div>`
        }
    </div>
  `;
}

// 6. TEAM & ACCESS
function renderTeamView() {
    return `
    <div class="space-y-5 animate-in">
      <div class="bg-[#0f1014] border border-[#27272a] rounded-xl p-5">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-sm font-semibold text-zinc-100">Reptile Studio Roster (${db.profiles.length})</h3>
            <p class="text-xs text-zinc-500 mt-0.5">Add new team emails in Supabase Auth + <code class="font-mono text-zinc-400">allowed_emails</code>.</p>
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
                    <div class="text-sm font-medium text-zinc-100 truncate">${escapeHtml(m.display_name)}</div>
                    <div class="text-xs text-zinc-500 truncate">${escapeHtml(m.studio_title)} · @${escapeHtml(m.username)}</div>
                  </div>
                </div>
                <button type="button" onclick="openEditProfileModal('${m.id}')" class="text-xs text-zinc-400 hover:text-emerald-400">Edit</button>
              </div>`
            )
            .join('')}
        </div>
      </div>
    </div>
  `;
}