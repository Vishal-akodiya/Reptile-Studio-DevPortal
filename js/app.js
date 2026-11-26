(async function bootApp() {
    const statusEl = document.getElementById('boot-status');
    try {
        const initialized = initSupabaseClient();
        checkOAuthRedirectErrors();

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
    }
})();
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
    } else if (e.key === 'Escape') {
        if (!document.getElementById('cmd-root')?.classList.contains('hidden')) closeCommandPalette();
        else if (!document.getElementById('modal-root')?.classList.contains('hidden')) closeModal();
    }
});