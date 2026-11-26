async function logActivity(action, target) {
    if (!sb || !currentProfile) return;
    const actor = currentProfile.display_name || currentProfile.username || 'Member';
    const { error } = await sb.from('activity_logs').insert({
        actor_name: actor,
        action,
        target,
    });
    if (error) console.error('[Reptile Studio] Activity log error:', error);
}

async function fetchAllData(showFeedback = false) {
    if (!sb) return;
    try {
        const [
            profilesRes,
            projectsRes,
            tasksRes,
            bugsRes,
            buildsRes,
            docsRes,
            activityRes,
        ] = await Promise.all([
            sb.from('profiles').select('*').order('created_at', { ascending: true }),
            sb.from('projects').select('*').order('created_at', { ascending: false }),
            sb.from('tasks').select('*').order('created_at', { ascending: false }),
            sb.from('bugs').select('*').order('created_at', { ascending: false }),
            sb.from('builds').select('*').order('created_at', { ascending: false }),
            sb.from('docs').select('*').order('created_at', { ascending: false }),
            sb.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(30),
        ]);

        for (const res of [profilesRes, projectsRes, tasksRes, bugsRes, buildsRes, docsRes, activityRes]) {
            if (res.error) throw res.error;
        }

        db.profiles = profilesRes.data || [];
        db.projects = projectsRes.data || [];
        db.tasks = tasksRes.data || [];
        db.bugs = bugsRes.data || [];
        db.builds = buildsRes.data || [];
        db.docs = docsRes.data || [];
        db.activity_logs = activityRes.data || [];

        const refreshedMe = db.profiles.find((p) => p.id === currentSession?.user?.id);
        if (refreshedMe) {
            currentProfile = refreshedMe;
            const avatarEl = document.getElementById('topbar-avatar');
            const nameEl = document.getElementById('topbar-user-name');
            if (avatarEl) avatarEl.textContent = getInitials(currentProfile.display_name);
            if (nameEl) nameEl.textContent = currentProfile.display_name;
        }

        updateNavCounts();
        renderCurrentView();
        if (showFeedback) showToast('Synced latest studio data', 'success');
    } catch (err) {
        console.error('[Reptile Studio] Fetch error:', err);
        showToast(`Sync failed: ${err.message || err}`, 'error');
    }
}

function setRealtimeStatus(state) {
    const label = document.getElementById('rt-label');
    if (!label) return;
    if (state === 'live') {
        label.textContent = 'Live Sync';
        label.className = 'text-emerald-400 font-medium';
    } else if (state === 'syncing') {
        label.textContent = 'Syncing...';
        label.className = 'text-amber-400 font-medium';
    } else {
        label.textContent = 'Offline / Retry';
        label.className = 'text-zinc-500 font-medium';
    }
}

function subscribeRealtime() {
    if (!sb) return;
    if (realtimeChannel) {
        sb.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }

    const tables = ['profiles', 'projects', 'tasks', 'bugs', 'builds', 'docs', 'activity_logs'];
    realtimeChannel = sb.channel('reptile-studio-live');

    tables.forEach((table) => {
        realtimeChannel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table },
            () => {
                setRealtimeStatus('syncing');
                clearTimeout(realtimeDebounce);
                realtimeDebounce = setTimeout(async () => {
                    await fetchAllData(false);
                    setRealtimeStatus('live');
                }, 250);
            }
        );
    });

    realtimeChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('error');
    });
}

function updateNavCounts() {
    const pEl = document.getElementById('nav-count-projects');
    const tEl = document.getElementById('nav-count-tasks');
    const bEl = document.getElementById('nav-count-bugs');
    if (pEl) pEl.textContent = String(db.projects.length);
    if (tEl) tEl.textContent = String(db.tasks.filter((t) => t.status !== 'Done').length);
    if (bEl) bEl.textContent = String(db.bugs.filter((b) => b.status === 'Open' || b.status === 'In Progress').length);
}

// --- Projects ---
async function saveProject(payload, id = null) {
    if (id) {
        const { error } = await sb.from('projects').update(payload).eq('id', id);
        if (error) return showToast(`Update failed: ${error.message}`, 'error');
        await logActivity('updated project', payload.name);
        showToast('Project updated', 'success');
    } else {
        const { error } = await sb.from('projects').insert(payload);
        if (error) return showToast(`Create failed: ${error.message}`, 'error');
        await logActivity('created project', payload.name);
        showToast('Project created', 'success');
    }
    await fetchAllData(false);
}

async function deleteProject(id, name) {
    const { error } = await sb.from('projects').delete().eq('id', id);
    if (error) return showToast(`Delete failed: ${error.message}`, 'error');
    await logActivity('deleted project', name);
    showToast('Project deleted', 'success');
    await fetchAllData(false);
}

async function toggleProjectMilestone(projectId, index) {
    const proj = getProjectById(projectId);
    if (!proj || !Array.isArray(proj.milestones) || !proj.milestones[index]) return;
    const updated = proj.milestones.map((m, idx) => (idx === index ? { ...m, done: !m.done } : m));
    const { error } = await sb.from('projects').update({ milestones: updated }).eq('id', projectId);
    if (error) return showToast(`Milestone update failed: ${error.message}`, 'error');
    await logActivity(updated[index].done ? 'completed milestone' : 'reopened milestone', `${proj.name} · ${updated[index].title}`);
    await fetchAllData(false);
}

// --- Tasks ---
async function saveTask(payload, id = null) {
    if (id) {
        const { error } = await sb.from('tasks').update(payload).eq('id', id);
        if (error) return showToast(`Task update failed: ${error.message}`, 'error');
        await logActivity('updated task', payload.title);
        showToast('Task updated', 'success');
    } else {
        const { error } = await sb.from('tasks').insert(payload);
        if (error) return showToast(`Task create failed: ${error.message}`, 'error');
        await logActivity('created task', payload.title);
        showToast('Task added', 'success');
    }
    await fetchAllData(false);
}

async function updateTaskStatus(taskId, newStatus) {
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    const { error } = await sb.from('tasks').update({ status: newStatus }).eq('id', taskId);
    if (error) return showToast(`Status update failed: ${error.message}`, 'error');
    await logActivity(`moved task to ${newStatus}`, task.title);
    showToast(`Moved to ${newStatus}`, 'success');
    await fetchAllData(false);
}

async function deleteTask(id, title) {
    const { error } = await sb.from('tasks').delete().eq('id', id);
    if (error) return showToast(`Delete failed: ${error.message}`, 'error');
    await logActivity('deleted task', title);
    showToast('Task deleted', 'success');
    await fetchAllData(false);
}

// --- Bugs ---
async function saveBug(payload, id = null) {
    if (id) {
        const { error } = await sb.from('bugs').update(payload).eq('id', id);
        if (error) return showToast(`Bug update failed: ${error.message}`, 'error');
        await logActivity('updated bug', payload.title);
        showToast('Bug updated', 'success');
    } else {
        const { error } = await sb.from('bugs').insert({
            ...payload,
            reporter_id: currentProfile?.id || null,
        });
        if (error) return showToast(`Bug report failed: ${error.message}`, 'error');
        await logActivity(`logged ${payload.severity.toLowerCase()} bug`, payload.title);
        showToast('Bug logged', 'success');
    }
    await fetchAllData(false);
}

async function updateBugStatus(bugId, newStatus) {
    const bug = db.bugs.find((b) => b.id === bugId);
    if (!bug || bug.status === newStatus) return;
    const { error } = await sb.from('bugs').update({ status: newStatus }).eq('id', bugId);
    if (error) return showToast(`Bug status update failed: ${error.message}`, 'error');
    await logActivity(`marked bug ${newStatus}`, bug.title);
    showToast(`Bug marked ${newStatus}`, 'success');
    await fetchAllData(false);
}

async function deleteBug(id, title) {
    const { error } = await sb.from('bugs').delete().eq('id', id);
    if (error) return showToast(`Delete failed: ${error.message}`, 'error');
    await logActivity('deleted bug', title);
    showToast('Bug deleted', 'success');
    await fetchAllData(false);
}

// --- Builds & Docs ---
async function saveBuild(payload) {
    const { error } = await sb.from('builds').insert(payload);
    if (error) return showToast(`Build save failed: ${error.message}`, 'error');
    const proj = getProjectById(payload.project_id);
    await logActivity('uploaded build', `${proj ? proj.name + ' ' : ''}${payload.version}`);
    showToast('Build logged', 'success');
    await fetchAllData(false);
}

async function deleteBuild(id, version) {
    const { error } = await sb.from('builds').delete().eq('id', id);
    if (error) return showToast(`Delete failed: ${error.message}`, 'error');
    await logActivity('removed build', version);
    showToast('Build removed', 'success');
    await fetchAllData(false);
}

async function saveDoc(payload) {
    const { error } = await sb.from('docs').insert(payload);
    if (error) return showToast(`Doc save failed: ${error.message}`, 'error');
    await logActivity('added doc link', payload.title);
    showToast('Doc saved', 'success');
    await fetchAllData(false);
}

async function deleteDoc(id, title) {
    const { error } = await sb.from('docs').delete().eq('id', id);
    if (error) return showToast(`Delete failed: ${error.message}`, 'error');
    await logActivity('removed doc', title);
    showToast('Doc removed', 'success');
    await fetchAllData(false);
}

// --- Profiles ---
async function updateMemberProfile(id, payload) {
    const { error } = await sb.from('profiles').update(payload).eq('id', id);
    if (error) return showToast(`Profile update failed: ${error.message}`, 'error');
    await logActivity('updated profile', payload.display_name);
    showToast('Profile saved', 'success');
    await fetchAllData(false);
}