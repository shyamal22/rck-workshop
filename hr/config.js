/* ---------------------------------------------------------------------
   RCK HR — site configuration.

   Unlike the workshop app, it is SAFE to fill both of these in and commit
   them, even though this repository is public.

   Why: the anon key below opens nothing on its own. Every table requires a
   signed-in account that is also on the hr_users list, and documents live
   in a private bucket reachable only through short-lived signed links. A
   stranger with this key and the app URL gets a sign-in screen and no more.

   That is the whole point of building it this way — you can hand the link
   to the HR manager and the director and it just works, with no key to
   type in and nothing confidential sitting in a public file.

     Supabase → Settings → API
       supabaseUrl = "Project URL"
       supabaseKey = the "anon / public" key   (NEVER the service_role key)
--------------------------------------------------------------------- */
window.RCKHR_CONFIG = {
  supabaseUrl: 'https://yipqmdokvcpyoiiswvqo.supabase.co',
  supabaseKey: 'sb_publishable_QDOlC6UJ5OG5xQg5sdHDEg_H9loKWnX',

  // Lock the screen after this many minutes with no activity, so an open
  // laptop doesn't leave staff files on display. Set to 0 to never lock.
  idleLockMinutes: 20,

  // Default amber warning window, in days, for requirements that don't set
  // their own. Change per requirement under ⋮ → Requirements.
  defaultWarnDays: 60
};
