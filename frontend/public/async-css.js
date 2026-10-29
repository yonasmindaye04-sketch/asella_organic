/**
 * async-css.js
 * Converts <link rel="preload" as="style"> to <link rel="stylesheet">
 * after the page has loaded, so external stylesheets don't block first paint.
 *
 * CSP-safe: external file only, no inline event handlers.
 */
(function () {
  function activatePreloadedStyles() {
    var links = document.querySelectorAll('link[rel="preload"][as="style"]');
    for (var i = 0; i < links.length; i++) {
      links[i].rel = 'stylesheet';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activatePreloadedStyles);
  } else {
    activatePreloadedStyles();
  }
})();
