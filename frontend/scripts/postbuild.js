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
