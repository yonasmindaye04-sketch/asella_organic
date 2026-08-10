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
const headerMatch = htaccessContent.match(/Header set Content-Security-Policy\s+"([^"]+)"/);

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

console.log('✅ CSP config matches dist/.htaccess');
