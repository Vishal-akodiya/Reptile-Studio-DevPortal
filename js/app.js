function bindStaticUIEvents() {
    // Complete Studio Profile submit
    document.getElementById('profile-setup-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!sb || !currentSession) return;
        const btn = document.getElementById('setup-profile-btn');
        const f = e.target;
        if (btn) btn.disabled = true;

        try {
            const { count } = await sb.from('profiles').select('*', { count: 'exact', head: true });
            const payload = {
                id: currentSession.user.id,
                display_name: f.display_name.value.trim(),
                username: f.username.value.trim().toLowerCase(),
                studio_title: f.studio_title.value.trim(),
                access_role: count === 0 ? 'Admin' : 'Member',
            };

            const { error } = await sb.from('profiles').insert(payload);
            if (error) {
                showToast(`Profile creation failed: ${error.message}`, 'error');
                return;
            }

            showToast('Profile created!', 'success');
            activeUserId = null;
            await handleSessionChange(currentSession);
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    // Email + Password Login submit
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!sb) return setLoginAlert('Connect your Supabase project first.', 'error');
        setLoginAlert('');
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) setLoginAlert(error.message, 'error');
    });

    // Forgot Password submit
    document.getElementById('forgot-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!sb) return;
        const email = document.getElementById('forgot-email').value.trim();
        const redirectTo = window.location.origin + window.location.pathname;
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) setLoginAlert(error.message, 'error');
        else setLoginAlert('Recovery email sent! Check your inbox.', 'success');
    });

    // Browser-level Supabase Config submit
    document.getElementById('supabase-config-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        localStorage.setItem(LS_URL_KEY, document.getElementById('cfg-sb-url').value.trim());
        localStorage.setItem(LS_KEY_KEY, document.getElementById('cfg-sb-key').value.trim());
        if (initSupabaseClient()) {
            updateLoginConfigUI();
            await bindAuthAndCheckSession();
        }
    });

    // Modals & Command Palette
    document.getElementById('modal-root')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-root') closeModal();
    });

    document.getElementById('cmd-root')?.addEventListener('click', (e) => {
        if (e.target.id === 'cmd-root') closeCommandPalette();
    });

    document.getElementById('cmd-input')?.addEventListener('input', (e) => {
        renderCommandResults(e.target.value);
    });

    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && currentSession && currentProfile) {
            e.preventDefault();
            openCommandPalette();
        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j' && currentSession && currentProfile) {
            e.preventDefault();
            toggleAIAgentDrawer();
        } else if (e.key === 'Escape') {
            if (!document.getElementById('cmd-root')?.classList.contains('hidden')) closeCommandPalette();
            else if (!document.getElementById('modal-root')?.classList.contains('hidden')) closeModal();
            else if (!document.getElementById('ai-drawer-root')?.classList.contains('hidden')) closeAIAgentDrawer();
        }
    });
    // Prevent browser from navigating away when external files are dropped outside a dropzone
    window.addEventListener('dragover', (e) => {
        if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
        if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    });
}

// Attach listeners immediately, then boot with a safety fallback timer
bindStaticUIEvents();

(async function bootApp() {
    const statusEl = document.getElementById('boot-status');
    const fallbackTimer = setTimeout(() => {
        const bootEl = document.getElementById('boot-view');
        if (bootEl && !bootEl.classList.contains('hidden')) {
            showScreen('login-view');
            updateLoginConfigUI();
            setLoginAlert('Startup timed out. Please sign in again.', 'error');
        }
    }, 6000);

    try {
        const initialized = initSupabaseClient();
        const hadOAuthError = checkOAuthRedirectErrors();
        if (hadOAuthError) return;

        if (!initialized) {
            showScreen('login-view');
            updateLoginConfigUI();
            return;
        }

        if (statusEl) statusEl.textContent = 'Checking studio session...';
        await bindAuthAndCheckSession();
    } catch (err) {
        console.error('[Reptile Studio] Boot error:', err);
        showScreen('login-view');
        updateLoginConfigUI();
        setLoginAlert(`Initialization error: ${err.message || err}`, 'error');
    } finally {
        clearTimeout(fallbackTimer);
    }
})();