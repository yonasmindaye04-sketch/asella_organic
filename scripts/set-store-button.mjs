/**
 * scripts/set-store-button.mjs
 *
 * Publishes the Telegram chat-menu button and waits until Telegram has actually
 * applied it.
 *
 * Written in Node because Invoke-RestMethod proved unreliable here for this
 * specific call, and because Node's fetch has been the path that worked
 * throughout. Node also prints Telegram's own error description, which
 * PowerShell was swallowing as an empty 400 body.
 *
 * Usage:  node scripts/set-store-button.mjs <url>
 */
const target = process.argv[2]
if (!target) {
  console.error("usage: node scripts/set-store-button.mjs <web-app-url>")
  process.exit(2)
}

const env = (await import("node:fs")).readFileSync(new URL("../backend/.env", import.meta.url), "utf8")
const token = (env.match(/^\s*TELEGRAM_BOT_TOKEN\s*=\s*(.+)$/m)?.[1] ?? "").trim()
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN not found in backend/.env")
  process.exit(2)
}

// A unique query changes Telegram's WebView cache key, forcing a re-fetch
// instead of replaying a cached copy of an earlier page.
const stamped = `${target}?v=${Date.now().toString(36)}`

const set = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    menu_button: { type: "web_app", text: "Store", web_app: { url: stamped } },
  }),
})
const setJson = await set.json()
if (!setJson.ok) {
  console.error(`setChatMenuButton FAILED (${set.status}): ${setJson.description ?? "no description"}`)
  process.exit(1)
}
console.log(`accepted -> ${stamped}`)

// Telegram answers ok:true immediately but applies the change 20-60s later.
const host = new URL(target).host
let applied = false
poll: for (let i = 0; i < 25; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  try {
    const cur = await (await fetch(`https://api.telegram.org/bot${token}/getChatMenuButton`)).json()
    const live = cur?.result?.web_app?.url
    if (live && live.includes(host)) {
      console.log(`applied  -> ${live}`)
      applied = true
      break poll
    }
  } catch {
    /* transient */
  }
}

if (!applied) {
  console.error("Telegram did not apply the change within 100s. Set it in BotFather:")
  console.error(`  /setmenubutton -> Store -> ${target}`)
  process.exitCode = 1
}
// Note: deliberately no process.exit(). On Windows that aborts pending async
// handles and trips "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"
// in uv/async.c, turning a success into a non-zero exit code.