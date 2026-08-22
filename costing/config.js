/* ---------------------------------------------------------------------
   RCK Costing — site configuration.

   Unlike the workshop and dispatch apps, it is SAFE to fill both of these
   in and commit them, even though this repository is public.

   Why: the anon key below opens nothing on its own. Every table requires a
   signed-in account that is also on the cost_users list. A stranger with
   this key and the app URL gets a sign-in screen and no more.

   That is the point of building it this way — the link can be handed to
   the director and it just works, with no key to type in and no margin
   sitting in a public file.

     Supabase → Settings → API
       supabaseUrl = "Project URL"
       supabaseKey = the "anon / public" key   (NEVER the service_role key)
--------------------------------------------------------------------- */
window.RCKC_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',

  // Lock the screen after this many minutes with no activity, so an open
  // laptop doesn't leave the margins on display. Set to 0 to never lock.
  idleLockMinutes: 20,

  // What appears on the letterhead of every printed sheet.
  brand: {
    name:  'RCK NZ',
    trade: 'Asphalt & Civil Contracting',
    email: 'office@rcknz.co.nz',
    phone: ''
  }
};
