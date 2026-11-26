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

// --- Storage Helpers (50 MB Cap + 1 GB Usage Guard) ---
function validateUploadFile(file) {
    if (!file) return { ok: false, message: 'No file selected.' };
    if (file.size > MAX_UPLOAD_BYTES) {
        return {
            ok: false,
            message: `File is ${formatBytes(file.size)}. Maximum allowed upload is 50 MB.`,
        };
    }
    const used = Number(db.storage?.used_bytes) || 0;
    const max = Number(db.storage?.max_bytes) || MAX_STORAGE_BYTES;
    if (used + file.size > max) {
        const remaining = Math.max(0, max - used);
        return {
            ok: false,
            message: `Not enough studio storage (${formatBytes(remaining)} left). Use an external link instead.`,
        };
    }
    return { ok: true };
}

async function uploadStudioFile(file, folder = 'general') {
    const check = validateUploadFile(file);
    if (!check.ok) {
        showToast(check.message, 'error');
        return null;
    }
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${folder}/${Date.now()}_${cleanName}`;
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
    });
    if (error) {
        showToast(`Upload failed: ${error.message}`, 'error');
        return null;
    }
    return {
        path: filePath,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
    };
}

async function removeStudioFile(filePath) {
    if (!filePath || !sb) return;
    const { error } = await sb.storage.from(STORAGE_BUCKET).remove([filePath]);
    if (error) console.error('[Reptile Studio] Storage cleanup error:', error);
}

async function getSignedMediaUrl(filePath, downloadName = null) {
    if (!filePath || !sb) return null;
    const options = downloadName ? { download: downloadName } : undefined;
    const { data, error } = await sb.storage.from(STORAGE_BUCKET).createSignedUrl(filePath, 300, options);
    if (error) {
        showToast(`Could not load file: ${error.message}`, 'error');
        return null;
    }
    return data?.signedUrl || null;
}

async function refreshStorageUsage() {
    if (!sb) return;
    const { data, error } = await sb.rpc('get_storage_usage');
    if (!error && data) {
        db.storage = {
            used_bytes: Number(data.used_bytes) || 0,
            file_count: Number(data.file_count) || 0,
            max_bytes: Number(data.max_bytes) || MAX_STORAGE_BYTES,
        };
        updateStorageMeterUI();
    }
}

function updateStorageMeterUI() {
    const used = Number(db.storage?.used_bytes) || 0;
    const max = Number(db.storage?.max_bytes) || MAX_STORAGE_BYTES;
    const pct = Math.min(100, Math.round((used / max) * 1000) / 10);
    const barColor = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-emerald-500';
    const txtColor = pct >= 90 ? 'text-red-400' : pct >= 75 ? 'text-amber-400' : 'text-emerald-400';

    const bar = document.getElementById('storage-usage-bar');
    const pctEl = document.getElementById('storage-usage-pct');
    const txtEl = document.getElementById('storage-usage-text');
    if (bar) {
        bar.style.width = `${Math.min(100, pct)}%`;
        bar.className = `h-full ${barColor} rounded-full transition-all`;
    }
    if (pctEl) {
        pctEl.textContent = `${pct}%`;
        pctEl.className = `font-mono ${txtColor}`;
    }
    if (txtEl) {
        txtEl.textContent = `${formatBytes(used)} / ${formatBytes(max)}`;
    }
}

// --- Core Fetch & Realtime ---
async function fetchAllData(showFeedback = false) {
    if (!sb) return;
    try {
        const queries = [
            sb.from('profiles').select('*').order('created_at', { ascending: true }),
            sb.from('projects').select('*').order('created_at', { ascending: false }),
            sb.from('tasks').select('*').order('created_at', { ascending: false }),
            sb.from('bugs').select('*').order('created_at', { ascending: false }),
            sb.from('builds').select('*').order('created_at', { ascending: false }),
            sb.from('docs').select('*').order('created_at', { ascending: false }),
            sb.from('assets').select('*').order('created_at', { ascending: false }),
            sb.from('comments').select('*').order('created_at', { ascending: true }),
            sb.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(30),
        ];

        const results = await Promise.all(queries);
        for (const res of results) {
            if (res.error) throw res.error;
        }

        db.profiles = results[0].data || [];
        db.projects = results[1].data || [];
        db.tasks = results[2].data || [];
        db.bugs = results[3].data || [];
        db.builds = results[4].data || [];
        db.docs = results[5].data || [];
        db.assets = results[6].data || [];
        db.comments = results[7].data || [];
        db.activity_logs = results[8].data || [];

        const refreshedMe = db.profiles.find((p) => p.id === currentSession?.user?.id);
        if (refreshedMe) {
            currentProfile = refreshedMe;
            const avatarEl = document.getElementById('topbar-avatar');
            const nameEl = document.getElementById('topbar-user-name');
            if (avatarEl) avatarEl.textContent = getInitials(currentProfile.display_name);
            if (nameEl) nameEl.textContent = currentProfile.display_name;
        }

        if (isAdmin()) {
            const wlRes = await sb.from('allowed_emails').select('*').order('email', { ascending: true });
            if (!wlRes.error) db.allowed_emails = wlRes.data || [];
        }

        await refreshStorageUsage();
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

    const tables = ['profiles', 'projects', 'tasks', 'bugs', 'builds', 'docs', 'assets', 'comments', 'activity_logs'];
    realtimeChannel = sb.channel('reptile-studio-live');

    tables.forEach((table) => {
        realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
            setRealtimeStatus('syncing');
            clearTimeout(realtimeDebounce);
            realtimeDebounce = setTimeout(async () => {
                await fetchAllData(false);
                setRealtimeStatus('live');
            }, 250);
        });
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
    const aEl = document.getElementById('nav-count-assets');
    if (pEl) pEl.textContent = String(db.projects.length);
    if (tEl) tEl.textContent = String(db.tasks.filter((t) => t.status !== 'Done').length);
    if (bEl) bEl.textContent = String(db.bugs.filter((b) => b.status === 'Open' || b.status === 'In Progress').length);
    if (aEl) aEl.textContent = String(db.assets.length);
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
    await sb.from('comments').delete().eq('entity_type', 'task').eq('entity_id', id);
    await logActivity('deleted task', title);
    showToast('Task deleted', 'success');
    await fetchAllData(false);
}

// --- Bugs (With Media Attachments) ---
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
    const existing = db.bugs.find((b) => b.id === id);
    if (existing?.media_path) {
        await removeStudioFile(existing.media_path);
    }
    const { error } = await sb.from('bugs').delete().eq('id', id);
    if (error) return showToast(`Delete failed: ${error.message}`, 'error');
    await sb.from('comments').delete().eq('entity_type', 'bug').eq('entity_id', id);
    await logActivity('deleted bug', title);
    showToast('Bug deleted', 'success');
    await fetchAllData(false);
}

// --- Assets Pipeline ---
async function saveAsset(payload, id = null) {
    if (id) {
        const { error } = await sb.from('assets').update(payload).eq('id', id);
        if (error) return showToast(`Asset update failed: ${error.message}`, 'error');
        await logActivity('updated asset', payload.name);
        showToast('Asset updated', 'success');
    } else {
        const { error } = await sb.from('assets').insert({
            ...payload,
            uploader_id: currentProfile?.id || null,
        });
        if (error) return showToast(`Asset save failed: ${error.message}`, 'error');
        await logActivity('added asset', payload.name);
        showToast('Asset saved', 'success');
    }
    await fetchAllData(false);
}

async function updateAssetStatus(assetId, newStatus) {
    const asset = db.assets.find((a) => a.id === assetId);
    if (!asset || asset.status === newStatus) return;
    const { error } = await sb.from('assets').update({ status: newStatus }).eq('id', assetId);
    if (error) return showToast(`Status update failed: ${error.message}`, 'error');
    await logActivity(`moved asset to ${newStatus}`, asset.name);
    showToast(`Asset marked ${newStatus}`, 'success');
    await fetchAllData(false);
}

async function deleteAssetById(id) {
    const asset = db.assets.find((a) => a.id === id);
    if (!asset) return;
    if (asset.file_path) {
        await removeStudioFile(asset.file_path);
    }
    const { error } = await sb.from('assets').delete().eq('id', id);
    if (error) return showToast(`Delete failed: ${error.message}`, 'error');
    await logActivity('deleted asset', asset.name);
    showToast('Asset deleted & storage freed', 'success');
    await fetchAllData(false);
}

async function downloadAssetById(id) {
    const asset = db.assets.find((a) => a.id === id);
    if (!asset) return;
    if (asset.file_path) {
        const url = await getSignedMediaUrl(asset.file_path, asset.file_name || asset.name);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } else if (asset.external_url) {
        window.open(safeUrl(asset.external_url), '_blank', 'noopener,noreferrer');
    }
}

// --- Comments ---
async function addComment(entityType, entityId, body) {
    const text = body.trim();
    if (!text) return false;
    const { error } = await sb.from('comments').insert({
        entity_type: entityType,
        entity_id: entityId,
        author_id: currentProfile?.id || null,
        body: text,
    });
    if (error) {
        showToast(`Comment failed: ${error.message}`, 'error');
        return false;
    }
    await fetchAllData(false);
    return true;
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

async function deleteBuildById(id) {
    const b = db.builds.find((x) => x.id === id);
    if (!b) return;
    const { error } = await sb.from('builds').delete().eq('id', id);
    if (error) return showToast(`Delete failed: ${error.message}`, 'error');
    await logActivity('removed build', b.version);
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

async function deleteDocById(id) {
    const d = db.docs.find((x) => x.id === id);
    if (!d) return;
    const { error } = await sb.from('docs').delete().eq('id', id);
    if (error) return showToast(`Delete failed: ${error.message}`, 'error');
    await logActivity('removed doc', d.title);
    showToast('Doc removed', 'success');
    await fetchAllData(false);
}

// --- Profiles & Admin Whitelist ---
async function updateMemberProfile(id, payload) {
    const { error } = await sb.from('profiles').update(payload).eq('id', id);
    if (error) return showToast(`Profile update failed: ${error.message}`, 'error');
    await logActivity('updated profile', payload.display_name);
    showToast('Profile saved', 'success');
    await fetchAllData(false);
}

async function addWhitelistEmail(email) {
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes('@')) return showToast('Enter a valid email address', 'error');
    const { error } = await sb.from('allowed_emails').insert({ email: clean });
    if (error) return showToast(`Whitelist add failed: ${error.message}`, 'error');
    await logActivity('whitelisted email', clean);
    showToast(`Whitelisted ${clean}`, 'success');
    await fetchAllData(false);
}

async function removeWhitelistEmail(email) {
    if (currentSession?.user?.email?.toLowerCase() === email.toLowerCase()) {
        return showToast('You cannot remove your own active email.', 'error');
    }
    const { error } = await sb.from('allowed_emails').delete().eq('email', email);
    if (error) return showToast(`Remove failed: ${error.message}`, 'error');
    await logActivity('removed whitelisted email', email);
    showToast(`Removed ${email}`, 'success');
    await fetchAllData(false);
}