// Create a DevTools panel.
chrome.devtools.panels.create(
    'LocalStorage Inspector',
    'icons/icon16.png',
    'panel/panel.html',
    function () {
        // Panel created.
    }
);
