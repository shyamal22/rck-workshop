/* ---------------------------------------------------------------------
   RCK People — site configuration.

   It is SAFE to fill both of these in and commit them, even though this
   repository is public.

   Why: the anon key below opens nothing on its own. Every table requires
   a signed-in account that is also on the staff_users list, and documents
   live in a private bucket reachable only through short-lived signed
   links. A stranger with this key and the app URL gets a sign-in screen
   and nothing else.

   That is the point of building it this way — you can hand the link to
   whoever needs it and it just works, with no key to type in and nothing
   confidential sitting in a public file.

     Supabase → Settings → API
       supabaseUrl = "Project URL"
       supabaseKey = the "anon / public" key   (NEVER the service_role key)
--------------------------------------------------------------------- */
window.RCKP_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',

  // Lock the screen after this many minutes with nothing happening, so an
  // open laptop doesn't leave staff files on display. Set to 0 to never lock.
  idleLockMinutes: 20,

  // How many days before an expiry date something turns amber, for tiles
  // that don't set their own window. Site Safe warns earlier because
  // renewals take a while; a drug test warns later because it doesn't.
  defaultWarnDays: 60
};
