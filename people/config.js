/* ---------------------------------------------------------------------
   RCK People — site configuration.

   It is SAFE to fill both of these in and commit them, even though this
   repository is public.

   Why: the anon key below opens nothing on its own. Every table requires
   a signed-in account that is also on the staff_users list, and documents
   live in a private bucket reachable only through short-lived signed
   links. A stranger with this key and the app URL gets a sign-in screen
   and nothing else.

   What must NEVER go in this file is either of the two shared account
   passwords. Those travel in the setup links you hand out, which is the
   whole reason the app works that way — anything written here is on a
   public web page.

     Supabase → Settings → API
       supabaseUrl = "Project URL"
       supabaseKey = the "anon / public" key   (NEVER the service_role key)
--------------------------------------------------------------------- */
window.RCKP_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',

  // Clear the screen after this many minutes with nothing happening, so a
  // phone left on a seat doesn't leave someone's file on display. Carrying
  // on afterwards is one tap. Set to 0 to never clear it.
  idleLockMinutes: 20,

  // How many days before an expiry date something turns amber, for tiles
  // that don't set their own window. Site Safe warns earlier because
  // renewals take a while; a drug test warns later because it doesn't.
  defaultWarnDays: 60
};
