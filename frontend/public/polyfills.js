/* Array.prototype.at polyfill — supports older browsers / crawler bots.
 * Loaded via <script src="/polyfills.js"> in index.html.
 * Must stay as an external file (not inline) because the site's CSP
 * has no 'unsafe-inline' in script-src. See DEPLOYMENT_GOTCHAS.md §6. */
if (!Array.prototype.at) {
  Array.prototype.at = function(n) {
    n = Math.trunc(n) || 0;
    if (n < 0) n += this.length;
    if (n < 0 || n >= this.length) return undefined;
    return this[n];
  };
}
