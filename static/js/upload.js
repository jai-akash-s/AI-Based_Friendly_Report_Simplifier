document.addEventListener('DOMContentLoaded', () => {
	const menuToggle = document.querySelector('[data-menu-toggle]');
	const siteNav = document.querySelector('[data-site-nav]');
	if (menuToggle && siteNav) menuToggle.addEventListener('click', () => { const open = siteNav.classList.toggle('open'); menuToggle.setAttribute('aria-expanded', String(open)); });
	const input = document.querySelector('[data-file-input]');
	const zone = document.querySelector('[data-upload-zone]');
	const meta = document.querySelector('[data-file-meta]');
	const name = document.querySelector('[data-file-name]');
	const size = document.querySelector('[data-file-size]');
	const remove = document.querySelector('[data-remove-file]');
	if (input && zone) {
		const showFile = (file) => { if (!file) return; name.textContent = file.name; size.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`; meta.classList.add('visible'); };
		input.addEventListener('change', () => showFile(input.files[0]));
		['dragenter', 'dragover'].forEach(event => zone.addEventListener(event, e => { e.preventDefault(); zone.classList.add('dragover'); }));
		['dragleave', 'drop'].forEach(event => zone.addEventListener(event, e => { e.preventDefault(); zone.classList.remove('dragover'); }));
		zone.addEventListener('drop', e => { input.files = e.dataTransfer.files; showFile(input.files[0]); });
		remove?.addEventListener('click', () => { input.value = ''; meta.classList.remove('visible'); });
		const form = zone.closest('form');
		const processing = document.querySelector('[data-processing-screen]');
		form?.addEventListener('submit', () => {
			if (!processing) return;
			processing.classList.add('visible');
			processing.setAttribute('aria-hidden', 'false');
			form.querySelector('button[type="submit"]')?.setAttribute('disabled', 'disabled');
		});
	}

	const passwordToggle = document.querySelector('[data-password-toggle]');
	const passwordInput = document.querySelector('#password');
	passwordToggle?.addEventListener('click', () => {
		const visible = passwordInput.type === 'text';
		passwordInput.type = visible ? 'password' : 'text';
		passwordToggle.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
		passwordToggle.innerHTML = `<i data-lucide="${visible ? 'eye' : 'eye-off'}"></i>`;
		if (window.lucide) lucide.createIcons();
	});
});
