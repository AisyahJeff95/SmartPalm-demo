
/* App Navigation Helper for Multi-Page Architecture */
function switchPage(pageId) {
    const pageMap = {
        'page-launcher': 'index.html',
        'page-comprehensive': 'comprehensive.html',
        'page-standard': 'standard.html',
        'page-reada': 'reada.html'
    };

    const targetUrl = pageMap[pageId];
    const targetElement = document.getElementById(pageId);

    if (targetElement) {
        document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
        targetElement.classList.add('active');
        if (pageId === 'page-reada' && typeof initReadaMapIfNeeded === 'function') {
            setTimeout(() => initReadaMapIfNeeded(), 100);
        }
    } else if (targetUrl) {
        window.location.href = targetUrl;
    }
}
