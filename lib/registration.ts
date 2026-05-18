/**
 * New sign-ups are off by default. Set REGISTRATION_DISABLED=false in .env to re-enable.
 * Also enforced on the server (API + /register page); redeploy required after changing .env.
 */
export function isRegistrationDisabled(): boolean {
  const env = process.env.REGISTRATION_DISABLED
  if (env === 'false' || env === '0') return false
  return true
}

export const REGISTRATION_CLOSED_MESSAGE =
  'New account registration is temporarily unavailable. Please try again later.'
