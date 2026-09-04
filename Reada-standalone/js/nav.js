function handleSignIn() {
            const userEl = document.getElementById('signin-username');
            const passEl = document.getElementById('signin-password');
            const errEl = document.getElementById('signin-error');
            
            const username = userEl ? userEl.value.trim().toLowerCase() : '';
            const password = passEl ? passEl.value.trim().toLowerCase() : '';

            // Allow sign in if admin/admin (case-insensitive), or if left blank
            if ((username === 'admin' || username === '') && (password === 'admin' || password === '')) {
                if (errEl) errEl.style.display = 'none';
                
                // Hide sign in page
                const signinPage = document.getElementById('page-signin');
                if (signinPage) signinPage.classList.remove('active');
                
                // Show launcher page
                const launcherPage = document.getElementById('page-launcher');
                if (launcherPage) launcherPage.classList.add('active');

                // Keep or reset to default admin
                if (userEl) userEl.value = 'admin';
                if (passEl) passEl.value = 'admin';
            } else {
                if (errEl) {
                    errEl.textContent = 'Invalid username or password. Default credentials: admin / admin';
                    errEl.style.display = 'block';
                }
            }
        }



        function toggleProfileDropdown(event) {
            if (event) event.stopPropagation();
            const menu = document.getElementById('profile-popover-menu');
            if (menu) {
                menu.classList.toggle('show');
            }
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const signinPage = document.getElementById('page-signin');
                if (signinPage && signinPage.classList.contains('active')) {
                    handleSignIn();
                }
            }
        });

        // Close dropdown popovers when clicking outside
        document.addEventListener('click', (e) => {
            const container = document.querySelector('.lang-dropdown-container');
            const menu = document.getElementById('lang-popover-menu');
            if (container && menu && !container.contains(e.target)) {
                menu.classList.remove('show');
            }

            const profContainer = document.querySelector('.profile-dropdown-container');
            const profMenu = document.getElementById('profile-popover-menu');
            if (profContainer && profMenu && !profContainer.contains(e.target)) {
                profMenu.classList.remove('show');
            }
        });

        document.addEventListener('DOMContentLoaded', () => {
            const savedLang = localStorage.getItem('palmnex_lang') || 'en';
            selectLanguage(savedLang);
        });

        