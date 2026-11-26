function showScreen(screenId) {
    ['boot-view', 'login-view', 'profile-setup-view', 'app-shell'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('hidden', id !== screenId);
    });
    refreshIcons();
}

function setLoginAlert(message, type = 'error') {
    const box = document.getElementById('login-alert');
    if (!box) return;
    if (!message) {
        box.classList.add('hidden');
        box.textContent = '';
        return;
    }
    box.className = `mb-4 px-3.5 py-2.5 rounded-lg text-xs border ${type === 'success'
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
        : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`;
    box.textContent = message;
    box.classList.remove('hidden');
}

function updateLoginConfigUI() {
    const cfg = getActiveConfig();
    const card = document.getElementById('supabase-config-card');
    const changeFooter = document.getElementById('change-conn-footer');
    const closeBtn = document.getElementById('close-config-btn');
    const clearBtn = document.getElementById('clear-config-btn');
    const dot = document.getElementById('login-conn-dot');
    const text = document.getElementById('login-conn-text');
    const submitBtn = document.getElementById('login-submit-btn');
    const googleBtn = document.getElementById('oauth-google-btn');
    const discordBtn = document.getElementById('oauth-discord-btn');

    const ready = Boolean(cfg.url && cfg.key);
    if (submitBtn) submitBtn.disabled = !ready;
    if (googleBtn) googleBtn.disabled = !ready;
    if (discordBtn) discordBtn.disabled = !ready;

    if (cfg.source === 'hardcoded') {
        card?.classList.add('hidden');
        changeFooter?.classList.add('hidden');
        dot.className = 'w-2 h-2 rounded-full bg-emerald-400 shrink-0';
        text.textContent = 'Connected to Reptile Studio Cloud';
    } else if (cfg.source === 'localStorage') {
        card?.classList.add('hidden');
        changeFooter?.classList.remove('hidden');
        closeBtn?.classList.remove('hidden');
        clearBtn?.classList.remove('hidden');
        document.getElementById('cfg-sb-url').value = cfg.url;
        document.getElementById('cfg-sb-key').value = cfg.key;
        dot.className = 'w-2 h-2 rounded-full bg-emerald-400 shrink-0';
        text.textContent = `Connected: ${cfg.url.replace(/^https?:\/\//, '')}`;
    } else {
        card?.classList.remove('hidden');
        changeFooter?.classList.add('hidden');
        closeBtn?.classList.add('hidden');
        clearBtn?.classList.add('hidden');
        dot.className = 'w-2 h-2 rounded-full bg-amber-400 shrink-0';
        text.textContent = 'Enter Supabase credentials above to connect';
    }
    refreshIcons();
}

function toggleConfigPanel(show) {
    const card = document.getElementById('supabase-config-card');
    if (!card) return;
    card.classList.toggle('hidden', !show);
    refreshIcons();
}

function clearLocalSupabaseConfig() {
    localStorage.removeItem(LS_URL_KEY);
    localStorage.removeItem(LS_KEY_KEY);
    sb = null;
    updateLoginConfigUI();
    setLoginAlert('Saved Supabase keys cleared.', 'info');
}

function toggleForgotMode(showForgot) {
    setLoginAlert('');
    document.getElementById('login-form')?.classList.toggle('hidden', showForgot);
    document.getElementById('oauth-section')?.classList.toggle('hidden', showForgot);
    document.getElementById('forgot-form')?.classList.toggle('hidden', !showForgot);
}

async function signInWithOAuthProvider(provider) {
    if (!sb) {
        setLoginAlert('Connect your Supabase project first.', 'error');
        return;
    }
    setLoginAlert('');
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) setLoginAlert(error.message, 'error');
}

function checkOAuthRedirectErrors() {
    const searchParams = new URLSearchParams(window.location.search);
    const hashStr = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const hashParams = new URLSearchParams(hashStr);

    const errDesc = searchParams.get('error_description') || hashParams.get('error_description') || searchParams.get('error') || hashParams.get('error');
    if (!errDesc) return;

    const decoded = decodeURIComponent(errDesc.replace(/\+/g, ' '));
    const isWhitelistBlock = /whitelisted|database error saving new user|access denied/i.test(decoded);
    window.history.replaceState(null, '', window.location.pathname);

    showScreen('login-view');
    updateLoginConfigUI();
    setLoginAlert(
        isWhitelistBlock
            ? 'Access denied: Your email is not in allowed_emails.'
            : `Sign-in failed: ${decoded}`,
        'error'
    );
}

async function handleSessionChange(session) {
    currentSession = session || null;

    if (!currentSession) {
        activeUserId = null;
        currentProfile = null;
        if (realtimeChannel && sb) {
            sb.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }
        showScreen('login-view');
        updateLoginConfigUI();
        return;
    }

    if (activeUserId === currentSession.user.id && currentProfile) {
        return;
    }
    activeUserId = currentSession.user.id;

    const { data: profile, error } = await sb
        .from('profiles')
        .select('*')
        .eq('id', currentSession.user.id)
        .maybeSingle();

    if (error) {
        console.error('Profile lookup error:', error);
        showScreen('login-view');
        updateLoginConfigUI();
        setLoginAlert(`Could not load profile: ${error.message}`, 'error');
        return;
    }

    if (!profile) {
        const meta = currentSession.user.user_metadata || {};
        const emailPrefix = (currentSession.user.email || '').split('@')[0];
        const handle = String(meta.preferred_username || meta.user_name || emailPrefix || '')
            .toLowerCase()
            .replace(/[^a-z0-9_.-]/g, '');
        const displayName =
            meta.full_name ||
            meta.name ||
            meta.custom_claims?.global_name ||
            (handle ? handle.charAt(0).toUpperCase() + handle.slice(1) : '');

        document.getElementById('setup-user-uid').textContent = currentSession.user.id;
        document.getElementById('setup-user-email').textContent = currentSession.user.email || '';
        const form = document.getElementById('profile-setup-form');
        form.username.value = handle;
        form.display_name.value = displayName;
        showScreen('profile-setup-view');
        return;
    }

    currentProfile = profile;
    document.getElementById('topbar-avatar').textContent = getInitials(profile.display_name);
    document.getElementById('topbar-user-name').textContent = profile.display_name;

    showScreen('app-shell');
    await fetchAllData(false);
    subscribeRealtime();
    navigateTo(currentView || 'overview');
}

async function bindAuthAndCheckSession() {
    if (authSubscription?.subscription) {
        authSubscription.subscription.unsubscribe();
    }

    const { data: subData } = sb.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
            showToast('Recovery session active — update your profile or password.', 'info');
        }
        handleSessionChange(session);
    });
    authSubscription = subData;

    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    await handleSessionChange(data.session);
}

async function handleSignOut() {
    if (sb) await sb.auth.signOut();
    currentSession = null;
    currentProfile = null;
    activeUserId = null;
    showScreen('login-view');
    updateLoginConfigUI();
}