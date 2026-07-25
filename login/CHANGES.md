# SAL Authentication Flow — Bug Fix & Changes

## Root Cause

After a user set their password and logged out, entering their email again showed
the **"Activate your account"** screen and sent an OTP. This happened because:

1. **Backend `/check-email`** was not correctly checking `password_hash` /
   `is_password_created`. It returned `step: 'first'` for returning users.
2. **Backend `/logout`** (or the logout handler on dashboard pages) may have been
   resetting `is_password_created` or `password_hash` — fields it must never touch.
3. **Backend `/send-otp`** had no guard preventing `purpose=first_login` from being
   called for users who already had a password.

Additional fix in this bundle:

- `auth-api.js` now unwraps the nested response payload. The flow expects
  `data.step`, `data.tempToken`, and login tokens directly; returning the full
  `{ success, data, message }` envelope made `data.step` undefined and could send
  existing users back through activation.
- `/verify-otp` now verifies the requested OTP purpose and returns that purpose
  with the temp token, so Forgot Password continues to the Reset Password screen.
- `/create-password` re-checks the token purpose against the current password
  state before saving the bcrypt hash.

---

## Files Changed

### `auth-flow.js` — Frontend
- Added a defensive redirect: if `/send-otp` returns "already activated", the
  frontend automatically switches to the password login screen instead of erroring.
- Added inline comments documenting the correct backend contract for each API call.
- All flow logic was already structurally correct — it routes on `data.step`, so
  fixing the backend response fixes the frontend behaviour automatically.

### `auth-api.js` — Frontend API layer
- Added `apiLogout()` function with correct contract documentation.
- Added inline backend pseudocode comments for every endpoint so the required
  server behaviour is explicit.

### `auth-state.js` — Frontend state
- Added explicit comment clarifying that `clearSession()` removes tokens only —
  it does not and must not reset any password-related server-side state.

### `backend-auth-routes.js` — **NEW** Backend reference
- Complete Express.js implementation of all `/api/auth/*` routes.
- **`/check-email`**: Uses `(user.password_hash || user.is_password_created)` to
  determine `step`. This is the primary fix.
- **`/send-otp`**: Rejects `purpose=first_login` if user already has a password.
- **`/create-password`**: Always sets `is_password_created = true` after saving hash.
- **`/logout`**: Deletes only the refresh token. Never touches `password_hash` or
  `is_password_created`.

### `backend-migration.sql` — **NEW** Database migration
- Adds `is_password_created` column if missing.
- Backfills `is_password_created = true` for all users who already have a `password_hash`.
- Creates `refresh_tokens` table if missing.

### `logout-helper.js` — **NEW** Dashboard logout script
- Drop-in script for any dashboard page.
- Calls `/api/auth/logout`, then clears only session tokens from `localStorage`.
- Redirects to `/login`. After re-entering email, returning users see the
  Password screen — never the Activate screen.

---

## Correct Flow After Fix

### Returning User (post-logout)
```
Enter email
  → Backend: password_hash exists → step = 'password'
  → Frontend: showStep('step-password')
  → User enters password → Login → Dashboard
  (OTP is never sent)
```

### First-Time User
```
Enter email
  → Backend: no password_hash, is_password_created = false → step = 'first'
  → Frontend: showStep('step-first')
  → User clicks "Send OTP" → OTP sent → Verify → Set Password
  → Backend saves: password_hash + is_password_created = true
  → Auto-login → Dashboard
```

### Forgot Password
```
Password screen → click "Forgot password?"
  → showStep('step-forgot') — email is read-only
  → User clicks "Send OTP" → purpose = 'reset_password'
  → Backend allows (user has a password) → OTP sent → Verify → Set new password
  → Backend updates: password_hash (new) — is_password_created stays true
  → Auto-login → Dashboard
```

### Logout
```
User clicks Logout (on any dashboard page)
  → POST /api/auth/logout { refreshToken }
  → Server deletes refresh token record ONLY
  → Server does NOT touch password_hash or is_password_created
  → Client clears localStorage tokens only
  → Redirect to /login
  → User enters email → Password screen (correct)
```

---

## Key Backend Rule

```javascript
// THE FIX — in /check-email handler:

// ❌ OLD (broken):
const step = user.firstLogin ? 'first' : 'password';

// ✅ NEW (correct):
const step = (user.password_hash || user.is_password_created) ? 'password' : 'first';
```

And in `/logout`:
```javascript
// ✅ Only delete the refresh token — NOTHING ELSE
await db.refreshTokens.delete({ token_hash: tokenHash });

// ❌ Never do any of these on logout:
// user.password_hash = null
// user.is_password_created = false
// user.firstLogin = true
```
