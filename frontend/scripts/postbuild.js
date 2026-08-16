import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cspConfigPath = path.resolve(__dirname, '../../csp-config.js');
const distDir = path.resolve(__dirname, '../dist');
const htaccessPath = path.join(distDir, '.htaccess');
const swPath = path.join(distDir, 'sw.js');

// 1. Generate CSP string
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cspConfig = require(cspConfigPath);

const cspString = Object.entries(cspConfig)
  .map(([key, values]) => {
    const directive = key.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    return `${directive} ${values.join(' ')}`;
  })
  .join('; ');

// 2. Append RewriteRule and CSP to .htaccess
if (fs.existsSync(htaccessPath)) {
  let htaccessContent = fs.readFileSync(htaccessPath, 'utf8');

  // Add RewriteRule if not exists
  if (!htaccessContent.includes('RewriteEngine On')) {
    htaccessContent += `\n
# ── 5. Single Page App Routing ───────────────────────────────────
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
`;
  }

  // Add CSP Header
  htaccessContent += `\n
# ── 6. Content Security Policy ───────────────────────────────────
<IfModule mod_headers.c>
  Header set Content-Security-Policy "${cspString}"
</IfModule>
`;

  fs.writeFileSync(htaccessPath, htaccessContent);
  console.log('✅ Updated dist/.htaccess with SPA RewriteRule and CSP.');
} else {
  console.warn('⚠️  dist/.htaccess not found. Skipping.');
}

// 3. Update sw.js __VERSION__
if (fs.existsSync(swPath)) {
  const hash = crypto.randomBytes(4).toString('hex');
  const swContent = fs.readFileSync(swPath, 'utf8');
  const updatedSw = swContent.replace('__VERSION__', `v-${hash}`);
  fs.writeFileSync(swPath, updatedSw);
  console.log(`✅ Updated dist/sw.js cache version to v-${hash}`);
} else {
  console.warn('⚠️  dist/sw.js not found. Skipping.');
}

// 4. Regression check — fail if any inline <script> block exists in dist/index.html
//
// WHY: The site CSP has no 'unsafe-inline' in script-src. Any inline <script>
// block (no src= attribute) will be silently blocked in production.
// Vite itself only emits <script type="module" src="..."> tags for this project
// (no @vitejs/plugin-legacy = no inline module-preload polyfill), so any
// inline <script> found here was added manually and must be externalised.
//
// Allowed patterns (must have a src= or be Vite's own type="module" tag):
//   <script type="module" src="/assets/index-xxx.js">  ← Vite bundle entry
//   <script src="/polyfills.js">                        ← externalised polyfill
// Blocked pattern (no src=):
//   <script>...code...</script>                         ← CSP violation!

const distIndexPath = path.join(distDir, 'index.html');
if (fs.existsSync(distIndexPath)) {
  const html = fs.readFileSync(distIndexPath, 'utf8');

  // Strip HTML comments first so that comment text mentioning <script>
  // (like our own CSP notice comment) doesn't trigger a false positive.
  const htmlWithoutComments = html.replace(/<!--[\s\S]*?-->/g, '');

  // Match <script> tags that have NO src= attribute (i.e. inline scripts).
  // The negative lookahead (?![^>]*\bsrc=) skips any tag that contains src=.
  const inlineScriptRe = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi;
  const inlineMatches = htmlWithoutComments.match(inlineScriptRe) ?? [];


  // Filter out empty self-closing variants that Vite may emit for edge cases.
  const violations = inlineMatches.filter(tag => {
    // Strip the opening/closing tags and check if there is actual content.
    const inner = tag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
    return inner.length > 0;
  });

  if (violations.length > 0) {
    console.error('');
    console.error('❌ CSP VIOLATION DETECTED in dist/index.html!');
    console.error('   Found ' + violations.length + ' inline <script> block(s) without a src= attribute.');
    console.error('   These will be blocked by the site CSP in production (no \'unsafe-inline\').');
    console.error('');
    console.error('   Fix: move the script content to a file in frontend/public/');
    console.error('        and reference it with <script src="/yourfile.js"></script>.');
    console.error('   See DEPLOYMENT_GOTCHAS.md §6 for details.');
    console.error('');
    violations.forEach((v, i) => {
      const preview = v.length > 120 ? v.slice(0, 120) + '...' : v;
      console.error(`   Violation ${i + 1}: ${preview}`);
    });
    process.exit(1);
  } else {
    console.log('✅ No inline <script> blocks found in dist/index.html (CSP safe).');
  }
} else {
  console.warn('⚠️  dist/index.html not found. Skipping inline-script check.');
}
