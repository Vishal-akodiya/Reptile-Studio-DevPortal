// Replace these two values with your Supabase Project URL and Publishable/Anon Key
const SUPABASE_URL = 'https://fprpvayqstsnawbmputz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_sXGycE_FBouIbcK-OhTwXA_Y0Vwin10';

const LS_URL_KEY = 'reptile_sb_url';
const LS_KEY_KEY = 'reptile_sb_key';

let sb = null;
let authSubscription = null;
let realtimeChannel = null;
let realtimeDebounce = null;
let currentSession = null;
let currentProfile = null;
let activeUserId = null;
let currentView = 'overview';
let draggedTaskId = null;

const db = {
    profiles: [],
    projects: [],
    tasks: [],
    bugs: [],
    builds: [],
    docs: [],
    activity_logs: [],
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

function isHardcodedConfig() {
    return (
        SUPABASE_URL &&
        SUPABASE_URL.trim() !== '' &&
        SUPABASE_URL !== 'https://fprpvayqstsnawbmputz.supabase.co' &&
        SUPABASE_PUBLISHABLE_KEY &&
        SUPABASE_PUBLISHABLE_KEY.trim() !== '' &&
        SUPABASE_PUBLISHABLE_KEY !== 'sb_publishable_sXGycE_FBouIbcK-OhTwXA_Y0Vwin10'
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
        throw new Error('Supabase SDK failed to load from CDN.');
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
    return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getProfileById(id) {
    return db.profiles.find((p) => p.id === id) || null;
}

function getProjectById(id) {
    return db.projects.find((p) => p.id === id) || null;
}

function refreshIcons() {
    if (window.lucide) lucide.createIcons();
}