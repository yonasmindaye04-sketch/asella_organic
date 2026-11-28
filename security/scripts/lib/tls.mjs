/**
 * security/scripts/lib/tls.mjs
 *
 * Lightweight TLS posture check using node:tls.
 * This is a passive handshake, not a scanner. For full cipher/protocol
 * coverage run testssl.sh (see security/scanners/testssl/README.md).
 */

import tls from "node:tls";

export function inspectTls(hostname, { port = 443, timeoutMs = 10_000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let socket;
    try {
      socket = tls.connect({
        host: hostname,
        port,
        servername: hostname,
        rejectUnauthorized: false,
        ALPNProtocols: ["h2", "http/1.1"],
      });
    } catch (error) {
      finish({ ok: false, error: error.message });
      return;
    }

    socket.setTimeout(timeoutMs);

    socket.once("secureConnect", () => {
      try {
        const cert = socket.getPeerCertificate(false);
        const cipher = socket.getCipher();
        const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
        const daysRemaining = validTo
          ? Math.floor((validTo.getTime() - Date.now()) / 86_400_000)
          : null;

        let identityError = null;
        if (cert && Object.keys(cert).length > 0) {
          try {
            const check = tls.checkServerIdentity(hostname, cert);
            identityError = check ? check.message : null;
          } catch (error) {
            identityError = error.message;
          }
        }

        finish({
          ok: true,
          protocol: socket.getProtocol(),
          cipher: cipher
            ? { name: cipher.name, version: cipher.version }
            : null,
          alpn: socket.alpnProtocol || null,
          authorized: socket.authorized,
          authorizationError: socket.authorizationError
            ? String(socket.authorizationError)
            : null,
          identityError,
          certificate: cert
            ? {
                subject: cert.subject,
                issuer: cert.issuer,
                validFrom: cert.valid_from,
                validTo: cert.valid_to,
                daysRemaining,
                serialNumber: cert.serialNumber,
                subjectAltName: cert.subjectaltname || null,
              }
            : null,
        });
      } finally {
        socket.end();
      }
    });

    socket.once("timeout", () => {
      finish({ ok: false, error: `TLS handshake timed out after ${timeoutMs}ms` });
      socket.destroy();
    });

    socket.once("error", (error) => {
      finish({ ok: false, error: error.message });
    });
  });
}
