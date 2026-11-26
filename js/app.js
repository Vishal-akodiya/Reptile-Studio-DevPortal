// 1. Complete Studio Profile submit
document.getElementById('profile-setup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!sb || !currentSession) return;
    const btn = document.getElementById('setup-profile-btn');
    const f = e.target;
    if (btn) btn.disabled = true;

    const payload = {
        id: currentSession.user.id,
        display_name: f.display_name.value.trim(),
        username: f.username.value.trim().toLowerCase(),
        studio_title: f.studio_title.value.trim(),
        access_role: db.profiles.length === 0 ? 'Admin' : 'Member',
    };

    const { error } = await sb.from('profiles').insert(payload);
    if (btn) btn.disabled = false;

    if (error) {
        showToast(`Profile creation failed: ${error.message}`, 'error');
        return;
    }

    activeUserId = null;
    await handleSessionChange(currentSession);
});

// 2. Email + Password Login submit
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!sb) return setLoginAlert('Connect your Supabase project first.', 'error');
    setLoginAlert('');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) setLoginAlert(error.message, 'error');
});

// 3. Forgot Password submit
document.getElementById('forgot-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!sb) return;
    const email = document.getElementById('forgot-email').value.trim();
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) setLoginAlert(error.message, 'error');
    else setLoginAlert('Recovery email sent! Check your inbox.', 'success');
});

// 4. Browser-level Supabase Config submit
document.getElementById('supabase-config-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    localStorage.setItem(LS_URL_KEY, document.getElementById('cfg-sb-url').value.trim());
    localStorage.setItem(LS_KEY_KEY, document.getElementById('cfg-sb-key').value.trim());
    if (initSupabaseClient()) {
        updateLoginConfigUI();
        await bindAuthAndCheckSession();
    }
});