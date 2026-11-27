const SUPABASE_URL = 'https://fprpvayqstsnawbmputz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_sXGycE_FBouIbcK-OhTwXA_Y0Vwin10';

const LS_URL_KEY = 'reptile_sb_url';
const LS_KEY_KEY = 'reptile_sb_key';

const STORAGE_BUCKET = 'studio-media';
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_STORAGE_BYTES = 1024 * 1024 * 1024;

let sb = null;
let authSubscription = null;
let realtimeChannel = null;
let realtimeDebounce = null;
let currentSession = null;
let currentProfile = null;
let activeUserId = null;
let sessionCheckInFlight = false;
let currentView = 'overview';
let draggedTaskId = null;

const db = {
    profiles: [],
    projects: [],
    tasks: [],
    bugs: [],
    builds: [],
    docs: [],
    assets: [],
    asset_folders: [],
    announcements: [],
    comments: [],
    allowed_emails: [],
    discord_webhooks: [],
    activity_logs: [],
    storage: { used_bytes: 0, file_count: 0, max_bytes: MAX_STORAGE_BYTES },
};

const filters = {
    projectStatus: 'All',
    projectSearch: '',
    boardProject: 'All',
    boardDiscipline: 'All',
    boardAssignee: 'All',
    boardSearch: '',
    bugProject: 'All',
    bugSeverity: 'All',
    bugStatus: 'All',
    bugSearch: '',
    assetProject: 'All',
    assetType: 'All',
    assetStatus: 'All',
    assetSearch: '',
    currentFolderId: null,
    buildsTab: 'builds',
    docsCategory: 'All',
    myTasksShowDone: false,
};

const PROJECT_STATUSES = ['Pre-Production', 'Prototyping', 'Vertical Slice', 'Alpha', 'Beta', 'Released'];
const TASK_STATUSES = ['Backlog', 'In Progress', 'In Review', 'Done'];
const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const TASK_DISCIPLINES = ['Code', '3D / Art', 'Audio', 'Level Design', 'UI / UX', 'QA'];
const BUG_SEVERITIES = ['Blocker', 'High', 'Medium', 'Low'];
const BUG_STATUSES = ['Open', 'In Progress', 'Fixed', 'Closed'];
const BUILD_PLATFORMS = ['Windows', 'Android', 'WebGL', 'Linux', 'macOS'];
const DOC_CATEGORIES = ['GDD', 'GitHub Repo', 'Art / 3D Assets', 'Audio', 'Design Ref', 'Other'];
const ASSET_TYPES = ['3D Model', 'Texture / Shader', 'Audio / SFX', 'Animation', 'UI / Icon', 'Script / Doc', 'VFX / Other'];
const ASSET_STATUSES = ['Concept', 'Greybox', 'WIP', 'In-Engine', 'Final'];
const ANNOUNCEMENT_CATEGORIES = ['General', 'Milestone', 'Urgent', 'Release'];

function isHardcodedConfig() {
    const url = (SUPABASE_URL || '').trim();
    const key = (SUPABASE_PUBLISHABLE_KEY || '').trim();
    return (
        url.startsWith('https://') &&
        !url.includes('YOUR_SUPABASE_URL') &&
        key.length > 15 &&
        !key.includes('YOUR_SUPABASE_PUBLISHABLE_KEY')
    );
}

function getActiveConfig() {
    if (isHardcodedConfig()) {
        return { url: SUPABASE_URL.trim(), key: SUPABASE_PUBLISHABLE_KEY.trim(), source: 'hardcoded' };
    }
    const lsUrl = (localStorage.getItem(LS_URL_KEY) || '').trim();
    const lsKey = (localStorage.getItem(LS_KEY_KEY) || '').trim();
    if (lsUrl && lsKey) {
        return { url: lsUrl, key: lsKey, source: 'localStorage' };
    }
    return { url: '', key: '', source: 'none' };
}

function initSupabaseClient() {
    const cfg = getActiveConfig();
    if (!cfg.url || !cfg.key) {
        sb = null;
        return false;
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase CDN script did not load.');
    }
    sb = window.supabase.createClient(cfg.url, cfg.key, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    });
    return true;
}

function isAdmin() {
    return currentProfile?.access_role === 'Admin';
}

function formatBytes(bytes) {
    const num = Number(bytes) || 0;
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

function toNullableDate(val) {
    return val && typeof val === 'string' && val.trim() !== '' ? val.trim() : null;
}

function toNullableUuid(val) {
    return val && typeof val === 'string' && val.trim() !== '' ? val.trim() : null;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeUrl(url) {
    if (!url) return '';
    const trimmed = url.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
}

function getInitials(name) {
    if (!name) return 'RS';
    const parts = name.trim().split(/\s+/);
    return parts.length === 1
        ? parts[0].slice(0, 2).toUpperCase()
        : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getProfileById(id) {
    return db.profiles.find((p) => p.id === id) || null;
}

function getProjectById(id) {
    return db.projects.find((p) => p.id === id) || null;
}

function getFolderById(id) {
    return db.asset_folders.find((f) => f.id === id) || null;
}

function getFolderBreadcrumbChain(folderId) {
    const chain = [];
    const visited = new Set();
    let cur = folderId ? getFolderById(folderId) : null;
    while (cur && !visited.has(cur.id)) {
        visited.add(cur.id);
        chain.unshift(cur);
        cur = cur.parent_id ? getFolderById(cur.parent_id) : null;
    }
    return chain;
}

function getFolderPathLabel(folderId) {
    const chain = getFolderBreadcrumbChain(folderId);
    if (!chain.length) return 'Root (No Folder)';
    const proj = chain[0].project_id ? getProjectById(chain[0].project_id) : null;
    const prefix = proj ? `${proj.name} / ` : 'General / ';
    return prefix + chain.map((f) => f.name).join(' / ');
}

function refreshIcons() {
    if (window.lucide) lucide.createIcons();
}