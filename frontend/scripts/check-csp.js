import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cspConfigPath = path.resolve(__dirname, '../../csp-config.js');
const htaccessPath = path.resolve(__dirname, '../dist/.htaccess');

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cspConfig = require(cspConfigPath);

const expectedCspString = Object.entries(cspConfig)
  .map(([key, values]) => {
    const directive = key.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    return `${directive} ${values.join(' ')}`;
  })
  .join('; ');

if (!fs.existsSync(htaccessPath)) {
  console.error('❌ dist/.htaccess not found. Run `npm run build` first.');
  process.exit(1);
}

const htaccessContent = fs.readFileSync(htaccessPath, 'utf8');
const cspMatches = htaccessContent.match(/Header (?:always )?set Content-Security-Policy/g);
if (!cspMatches || cspMatches.length !== 1) {
  console.error(`❌ Expected exactly one Content-Security-Policy line in dist/.htaccess, found ${cspMatches ? cspMatches.length : 0}`);
  process.exit(1);
}

const headerMatch = htaccessContent.match(/Header (?:always )?set Content-Security-Policy\s+"([^"]+)"/);
if (!headerMatch) {
  console.error('❌ Content-Security-Policy header not found in dist/.htaccess');
  process.exit(1);
}

const actualCspString = headerMatch[1];

if (expectedCspString !== actualCspString) {
  console.error('❌ CSP Mismatch!');
  console.error('Expected:', expectedCspString);
  console.error('Actual:  ', actualCspString);
  process.exit(1);
}

const redirectIndex = htaccessContent.indexOf('RewriteRule ^(.*)$ "https\\:\\/\\/www\\.asellaorganic\\.com\\/$1" [R=301,L]');
const spaIndex = htaccessContent.indexOf('RewriteRule . /index.html');
if (redirectIndex === -1 || spaIndex === -1 || redirectIndex > spaIndex) {
  console.error('❌ Redirect RewriteRule must appear before SPA RewriteRule . /index.html in dist/.htaccess');
  process.exit(1);
}

console.log('✅ CSP config matches dist/.htaccess');
