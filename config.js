/* ---------------------------------------------------------------------
   RCK Workshop — site configuration.

   WARNING: this repository and the published site are PUBLIC. Anything
   written below is readable by anyone who finds the page. The Supabase key
   is therefore deliberately left blank — each device is given the Project
   URL and anon key once, in the app's Settings screen, so the key never
   appears on a public page.

   Only fill these in if the app moves to a private host, and you accept
   that anyone who reaches the page can read and write the gear data.

     Supabase → Settings → API
       supabaseUrl = "Project URL"
       supabaseKey = the "anon / public" key   (NEVER the service_role key)
--------------------------------------------------------------------- */
window.RCKW_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',

  // Optional. If set, switching a device into Workshop mode asks for this
  // code first, so crew phones can't close work orders by accident.
  // It is a speed bump, not a password — the code is visible in this file.
  workshopPin: ''
};
