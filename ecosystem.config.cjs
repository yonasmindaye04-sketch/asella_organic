
/**
 * ecosystem.config.cjs
 * Asella Organic — PM2 Process Manager Configuration
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs         # start
 *   pm2 stop asella-api                    # stop
 *   pm2 restart asella-api                 # restart
 *   pm2 reload asella-api                  # zero-downtime reload
 *   pm2 logs asella-api                    # tail logs
 *   pm2 monit                              # live CPU/RAM dashboard
 *   pm2 save                               # save process list
 *   pm2 startup                            # auto-start on server reboot
 */

module.exports = {
  apps: [
    {
      name:          "asella-api",
      script:        "./backend/src/server.js",

      // Cluster mode — one worker per CPU core (adjust to your host's CPU)
      // Set instances: 1 if on a shared host with limited resources
      instances:     1,
      exec_mode:     "fork",

      // Auto-restart on crash
      autorestart:   true,
      watch:         false,           // Never watch in production
      max_restarts:  10,
      restart_delay: 5000,            // Wait 5s between restarts

      // Memory limit — restart if process exceeds 500MB
      max_memory_restart: "500M",

      // Environment
      env: {
        NODE_ENV: "production",
        PORT:     "3001",
      },

      // Logging
      out_file:       "./logs/pm2-out.log",
      error_file:     "./logs/pm2-error.log",
      log_file:       "./logs/pm2-combined.log",
      time:           true,              // Prefix logs with timestamp
      log_date_format: "YYYY-MM-DD HH:mm:ss",

      // Graceful shutdown
      kill_timeout:  5000,              // 5s to finish in-flight requests
      listen_timeout: 10000,            // 10s to start listening
    },
  ],
};
