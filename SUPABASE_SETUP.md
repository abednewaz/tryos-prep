# TRYOS Prep — Supabase and Vercel setup

The site stays a static upload. Accounts do not work until you create a free Supabase project and paste two public values. No service-role key belongs in this project or in Vercel.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a project.
2. Open **SQL Editor**, paste the whole file `supabase/setup.sql`, and run it.
3. Open **Project Settings → API**.
4. Copy the **Project URL** and the **anon public** key. Do not copy the service_role key.

## 2. Turn on email sign-in

In **Authentication → Providers**, enable Email. Leave phone and social providers off.

In **Authentication → Providers → Email**:

- Turn on **Confirm email**.
- Set the minimum password length to 8.

In **Authentication → URL configuration**:

- Site URL: `https://tryos-prep.vercel.app` (use your real domain).
- Redirect URLs, add each of these:
  - `https://tryos-prep.vercel.app/**`
  - `https://tryos-prep.vercel.app/reset-password`
  - `https://tryos-prep.vercel.app/account`
  - `http://127.0.0.1:8080/**`

Password reset and email confirmation links must be allowed there or they will be rejected.

## 3. Email delivery

Supabase’s built-in mail is only for trying the project. It is rate-limited and often will not deliver to students. For real sign-up and password reset, open **Authentication → Emails → SMTP Settings** and connect your own SMTP provider.

## 4. Where to put the keys

Preferred, so you do not edit code for every deploy:

1. Vercel → your project → **Settings → Environment Variables**.
2. Add `SUPABASE_URL` = the Project URL.
3. Add `SUPABASE_ANON_KEY` = the anon public key.
4. Apply them to Production (and Preview if you use it).
5. Redeploy.

The file `api/public-config.js` reads those two variables and the browser uses them. They are public by design. The database still blocks private access with Row Level Security.

If you are not using that Vercel function, paste the same two values into `supabase-config.js`:

```js
window.TRYOS_SUPABASE = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_ANON_PUBLIC_KEY"
};
```

Never put the service-role key in `supabase-config.js`, `.env`, or Vercel.

## 5. Deploy

Upload the ZIP so `index.html` is at the site root, together with `auth.js`, `supabase-config.js`, `api/`, `iq/`, `math/`, and `supabase/`.

## 6. What you still have to try yourself

This environment has no Supabase project, so these were not run against a live database:

- Sign up, confirmation email, and sign in
- Password reset email and setting a new password
- Email change confirmation
- Profile photo upload
- Writing, editing, and deleting a review
- A second user failing to edit someone else’s review
