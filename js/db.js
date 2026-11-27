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

// --- Storage Helpers ---
function validateUploadFile(file) {
    if (!file) return { ok: false, message: 'No file selected.' };
    if (file.size > MAX_UPLOAD_BYTES) {
        return { ok: false, message: `File is ${formatBytes(file.size)}. Max upload size is 50 MB.` };
    }
    const used = Number(db.storage?.used_bytes) || 0;
    const max = Number(db.storage?.max_bytes) || MAX_STORAGE_BYTES;
    if (used + file.size > max) {
        const remaining = Math.max(0, max - used);
        return { ok: false, message: `Not enough storage (${formatBytes(remaining)} left). Use an external link instead.` };
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
    if (txtEl) txtEl.textContent = `${formatBytes(used)} / ${formatBytes(max)}`;
}

// --- Core Fetch & Realtime ---
async function fetchAllData(showFeedback = false) {
    if (!sb) return;
    try {
        const results = await Promise.all([
            sb.from('profiles').select('*').order('created_at', { ascending: true }),
            sb.from('projects').select('*').order('created_at', { ascending: false }),
            sb.from('tasks').select('*').order('created_at', { ascending: false }),
            sb.from('bugs').select('*').order('created_at', { ascending: false }),
            sb.from('builds').select('*').order('created_at', { ascending: false }),
            sb.from('docs').select('*').order('created_at', { ascending: false }),
            sb.from('assets').select('*').order('created_at', { ascending: false }),
            sb.from('asset_folders').select('*').order('name', { ascending: true }),
            sb.from('announcements').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }),
            sb.from('comments').select('*').order('created_at', { ascending: true }),
            sb.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(30),
            sb.from('studio_ai_memories').select('*').order('created_at', { ascending: false }),
        ]);

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
        db.asset_folders = results[7].data || [];
        db.announcements = results[8].data || [];
        db.comments = results[9].data || [];
        db.activity_logs = results[10].data || [];
        db.studio_ai_memories = results[11].data || [];

        // Reset currentFolderId if the folder was deleted
        if (filters.currentFolderId && !getFolderById(filters.currentFolderId)) {
            filters.currentFolderId = null;
        }

        const refreshedMe = db.profiles.find((p) => p.id === currentSession?.user?.id);
        if (refreshedMe) {
            currentProfile = refreshedMe;
            const avatarEl = document.getElementById('topbar-avatar');
            const nameEl = document.getElementById('topbar-user-name');
            if (avatarEl) avatarEl.textContent = getInitials(currentProfile.display_name);
            if (nameEl) nameEl.textContent = currentProfile.display_name;
        }

        if (isAdmin()) {
            const [wlRes, whRes] = await Promise.all([
                sb.from('allowed_emails').select('*').order('email', { ascending: true }),
                sb.from('discord_webhooks').select('*').order('channel_key', { ascending: true }),
            ]);
            if (!wlRes.error) db.allowed_emails = wlRes.data || [];
            if (!whRes.error) db.discord_webhooks = whRes.data || [];
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

    const tables = [
        'profiles', 'projects', 'tasks', 'bugs', 'builds', 'docs',
        'assets', 'asset_folders', 'announcements', 'comments', 'activity_logs', 'studio_ai_memories',
    ];
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
    const anEl = document.getElementById('nav-count-announcements');
    if (pEl) pEl.textContent = String(db.projects.length);
    if (tEl) tEl.textContent = String(db.tasks.filter((t) => t.status !== 'Done').length);
    if (bEl) bEl.textContent = String(db.bugs.filter((b) => b.status === 'Open' || b.status === 'In Progress').length);
    if (aEl) aEl.textContent = String(db.assets.length);
    if (anEl) anEl.textContent = String(db.announcements.length);
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

// --- Bugs ---
async function saveBug(payload, id = null) {
    if (id) {
        const { error } = await sb.from('bugs').update(payload).eq('id', id);
        if (error) return showToast(`Bug update failed: ${error.message}`, 'error');
        await logActivity('updated bug', payload.title);
        showToast('Bug updated', 'success');
    } else {
        const { error } = await sb.from('bugs').insert({ ...payload, reporter_id: currentProfile?.id || null });
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
    if (existing?.media_path) await removeStudioFile(existing.media_path);
    const { error } = await sb.from('bugs').delete().eq('id', id);
    if (error) return showToast(`Delete failed: ${error.message}`, 'error');
    await sb.from('comments').delete().eq('entity_type', 'bug').eq('entity_id', id);
    await logActivity('deleted bug', title);
    showToast('Bug deleted', 'success');
    await fetchAllData(false);
}

// --- Asset Folders (Nested) ---
async function saveAssetFolder(payload, id = null) {
    if (id) {
        const { error } = await sb.from('asset_folders').update({ name: payload.name }).eq('id', id);
        if (error) return showToast(`Rename failed: ${error.message}`, 'error');
        await logActivity('renamed folder', payload.name);
        showToast('Folder renamed', 'success');
    } else {
        const { error } = await sb.from('asset_folders').insert({
            ...payload,
            created_by: currentProfile?.id || null,
        });
        if (error) return showToast(`Folder create failed: ${error.message}`, 'error');
        await logActivity('created folder', payload.name);
        showToast('Folder created', 'success');
    }
    await fetchAllData(false);
}

async function deleteAssetFolder(id) {
    const folder = getFolderById(id);
    if (!folder) return;
    const { error } = await sb.from('asset_folders').delete().eq('id', id);
    if (error) return showToast(`Folder delete failed: ${error.message}`, 'error');
    if (filters.currentFolderId === id) filters.currentFolderId = folder.parent_id || null;
    await logActivity('deleted folder', folder.name);
    showToast('Folder deleted (files moved to root)', 'success');
    await fetchAllData(false);
}

// --- Assets ---
async function saveAsset(payload, id = null) {
    if (id) {
        const { error } = await sb.from('assets').update(payload).eq('id', id);
        if (error) return showToast(`Asset update failed: ${error.message}`, 'error');
        await logActivity('updated asset', payload.name);
        showToast('Asset updated', 'success');
    } else {
        const { error } = await sb.from('assets').insert({ ...payload, uploader_id: currentProfile?.id || null });
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
    if (asset.file_path) await removeStudioFile(asset.file_path);
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
// --- Multi-File Drag & Drop Batch Upload ---
const assetUploadState = {
    active: false,
    total: 0,
    completed: 0,
    currentName: '',
};

function guessAssetType(fileName = '') {
    const ext = String(fileName).split('.').pop().toLowerCase();
    if (['glb', 'gltf', 'fbx', 'obj', 'blend', 'dae', 'stl', '3ds'].includes(ext)) return '3D Model';
    if (['png', 'jpg', 'jpeg', 'webp', 'tga', 'psd', 'exr', 'hdr', 'dds', 'bmp', 'hlsl', 'shader', 'cginc', 'glsl', 'mat'].includes(ext)) return 'Texture / Shader';
    if (['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'aiff'].includes(ext)) return 'Audio / SFX';
    if (['anim', 'controller', 'bvh'].includes(ext)) return 'Animation';
    if (['svg', 'ico', 'ttf', 'otf', 'woff', 'woff2'].includes(ext)) return 'UI / Icon';
    if (['cs', 'js', 'ts', 'py', 'json', 'xml', 'yaml', 'yml', 'md', 'txt', 'pdf', 'csv', 'sql', 'html', 'css'].includes(ext)) return 'Script / Doc';
    return 'VFX / Other';
}

function renderUploadProgressBanner() {
    if (!assetUploadState.active) return '';
    const pct = assetUploadState.total > 0
        ? Math.round((assetUploadState.completed / assetUploadState.total) * 100)
        : 0;

    return `
    <div id="asset-upload-progress" class="mt-3 p-3 rounded-lg bg-[#09090b] border border-emerald-500/35 space-y-1.5">
      <div class="flex items-center justify-between gap-2 text-xs">
        <span class="font-medium text-emerald-300 truncate">
          Uploading ${Math.min(assetUploadState.completed + 1, assetUploadState.total)} of ${assetUploadState.total}: ${escapeHtml(assetUploadState.currentName)}
        </span>
        <span class="font-mono text-emerald-400 shrink-0">${pct}%</span>
      </div>
      <div class="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
        <div class="h-full bg-emerald-500 rounded-full transition-all" style="width:${pct}%"></div>
      </div>
    </div>
  `;
}

function updateUploadProgressUI() {
    const slot = document.getElementById('asset-upload-progress-slot');
    if (slot) slot.innerHTML = renderUploadProgressBanner();
}

async function uploadMultipleAssets(files, targetFolderId = undefined) {
    if (!sb || !files || !files.length) return;
    if (assetUploadState.active) {
        showToast('Wait for the current upload batch to finish.', 'info');
        return;
    }

    const folderId = targetFolderId !== undefined ? targetFolderId : (filters.currentFolderId || null);
    const targetFolder = folderId ? getFolderById(folderId) : null;
    const projectId = targetFolder
        ? (targetFolder.project_id || null)
        : (filters.assetProject !== 'All' ? filters.assetProject : null);

    let projectedUsed = Number(db.storage?.used_bytes) || 0;
    const maxBytes = Number(db.storage?.max_bytes) || MAX_STORAGE_BYTES;

    assetUploadState.active = true;
    assetUploadState.total = files.length;
    assetUploadState.completed = 0;
    assetUploadState.currentName = files[0].name;
    updateUploadProgressUI();

    const rowsToInsert = [];
    const uploadedPaths = [];
    const skipped = [];

    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            assetUploadState.currentName = file.name;
            updateUploadProgressUI();

            if (file.size > MAX_UPLOAD_BYTES) {
                skipped.push(`${file.name} (> 50 MB)`);
                assetUploadState.completed++;
                updateUploadProgressUI();
                continue;
            }

            if (projectedUsed + file.size > maxBytes) {
                skipped.push(`${file.name} (storage full)`);
                assetUploadState.completed++;
                updateUploadProgressUI();
                continue;
            }

            const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const filePath = `assets/${Date.now()}_${i}_${cleanName}`;
            const { error: upErr } = await sb.storage.from(STORAGE_BUCKET).upload(filePath, file, {
                cacheControl: '3600',
                upsert: false,
            });

            if (upErr) {
                skipped.push(`${file.name} (${upErr.message})`);
            } else {
                projectedUsed += file.size;
                uploadedPaths.push(filePath);
                rowsToInsert.push({
                    name: file.name,
                    project_id: projectId,
                    folder_id: folderId,
                    asset_type: guessAssetType(file.name),
                    status: 'WIP',
                    file_path: filePath,
                    file_name: file.name,
                    file_size: file.size,
                    external_url: '',
                    notes: '',
                    uploader_id: currentProfile?.id || null,
                });
            }

            assetUploadState.completed++;
            updateUploadProgressUI();
        }

        if (rowsToInsert.length > 0) {
            const { error: dbErr } = await sb.from('assets').insert(rowsToInsert);
            if (dbErr) {
                // Roll back storage files if DB insert fails
                if (uploadedPaths.length) await sb.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
                showToast(`Database save failed: ${dbErr.message}`, 'error');
                return;
            }

            const destLabel = targetFolder ? ` into ${targetFolder.name}` : '';
            const summary =
                rowsToInsert.length === 1
                    ? rowsToInsert[0].name
                    : `${rowsToInsert.length} assets${destLabel}`;
            await logActivity('uploaded', summary);
        }

        if (rowsToInsert.length > 0 && skipped.length === 0) {
            showToast(
                `Uploaded ${rowsToInsert.length} ${rowsToInsert.length === 1 ? 'asset' : 'assets'}${targetFolder ? ` to ${targetFolder.name}` : ''}`,
                'success'
            );
        } else if (rowsToInsert.length > 0 && skipped.length > 0) {
            showToast(`Uploaded ${rowsToInsert.length}, skipped ${skipped.length}: ${skipped[0]}`, 'info');
        } else if (skipped.length > 0) {
            showToast(`Upload skipped: ${skipped[0]}`, 'error');
        }
    } finally {
        assetUploadState.active = false;
        assetUploadState.total = 0;
        assetUploadState.completed = 0;
        assetUploadState.currentName = '';
        await fetchAllData(false);
    }
}

// --- Announcements (Admin Only) ---
async function saveAnnouncement(payload, id = null) {
    if (id) {
        const { error } = await sb.from('announcements').update(payload).eq('id', id);
        if (error) return showToast(`Update failed: ${error.message}`, 'error');
        await logActivity('updated announcement', payload.title);
        showToast('Announcement updated', 'success');
    } else {
        const { error } = await sb.from('announcements').insert({ ...payload, author_id: currentProfile?.id || null });
        if (error) return showToast(`Post failed: ${error.message}`, 'error');
        await logActivity('posted announcement', payload.title);
        showToast('Announcement published', 'success');
    }
    await fetchAllData(false);
}

async function toggleAnnouncementPin(id, currentPinned) {
    const { error } = await sb.from('announcements').update({ pinned: !currentPinned }).eq('id', id);
    if (error) return showToast(`Pin failed: ${error.message}`, 'error');
    showToast(!currentPinned ? 'Pinned to top' : 'Unpinned', 'success');
    await fetchAllData(false);
}

async function deleteAnnouncementById(id) {
    const an = db.announcements.find((a) => a.id === id);
    const { error } = await sb.from('announcements').delete().eq('id', id);
    if (error) return showToast(`Delete failed: ${error.message}`, 'error');
    if (an) await logActivity('deleted announcement', an.title);
    showToast('Announcement deleted', 'success');
    await fetchAllData(false);
}

// --- Discord Webhooks (Admin Only) ---
async function saveDiscordWebhook(channelKey, webhookUrl, enabled) {
    const { error } = await sb
        .from('discord_webhooks')
        .update({ webhook_url: webhookUrl.trim(), enabled: Boolean(enabled), updated_at: new Date().toISOString() })
        .eq('channel_key', channelKey);
    if (error) return showToast(`Webhook save failed: ${error.message}`, 'error');
    showToast('Discord webhook saved', 'success');
    await fetchAllData(false);
}

async function runTestDiscordWebhook(channelKey) {
    const { error } = await sb.rpc('test_discord_webhook', { p_channel_key: channelKey });
    if (error) return showToast(`Test failed: ${error.message}`, 'error');
    showToast('Test notification sent to Discord!', 'success');
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

// --- Builds, Docs, Profiles, Whitelist ---
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
// --- AI Agent Persistent Studio Memories ---
async function saveStudioMemory(payload) {
    const { error } = await sb.from('studio_ai_memories').insert({
        category: payload.category || 'Rule',
        content: payload.content.trim(),
        created_by: currentProfile?.id || null,
    });
    if (error) return showToast(`Memory save failed: ${error.message}`, 'error');
    await logActivity('saved AI memory', payload.content.slice(0, 60));
    showToast('Saved to Studio AI memory', 'success');
    await fetchAllData(false);
}

async function deleteStudioMemory(id) {
    const { error } = await sb.from('studio_ai_memories').delete().eq('id', id);
    if (error) return showToast(`Delete failed: ${error.message}`, 'error');
    showToast('Memory removed', 'success');
    await fetchAllData(false);
}