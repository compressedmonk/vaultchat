/** App-specific cookie name — avoids clashes with other apps on the same parent domain. */
export const SESSION_COOKIE_NAME = 'vaultchat_session'

/** Legacy name from early deploys; cleared on login/logout. */
export const LEGACY_SESSION_COOKIE_NAME = 'session'

/** Set on successful login; required to open /chat (blocks stale /chat tab restores). */
export const AUTH_INTENT_COOKIE_NAME = 'vaultchat_auth_intent'
