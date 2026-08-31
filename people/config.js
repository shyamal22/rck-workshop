/* ---------------------------------------------------------------------
   RCK People — site configuration.

   WARNING: this repository and the published site are PUBLIC. Anything
   written below is readable by anyone who finds the page.

   This app holds wages, bank account numbers and dates of birth, and it
   has no logins — so the Supabase key IS the thing keeping strangers out.
   It is therefore deliberately left blank here. Each phone is given the
   Project URL and anon key once, by tapping a setup link, so the key
   never appears on a public page.

   Fill these in and you are publishing the staff records to the internet.
   Don't.

     Supabase → Settings → API
       supabaseUrl = "Project URL"
       supabaseKey = the "anon / public" key   (NEVER the service_role key)
--------------------------------------------------------------------- */
window.RCKP_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',

  // Optional. If set, switching a phone into Director mode asks for this
  // code first, so a site phone can't see pay or change a record by
  // accident.
  //
  // It is a speed bump, not a password — the code is in this file, and
  // this file is public. Anyone holding the setup link can read the pay
  // out of the database whatever the app shows them. Same arrangement as
  // the office code in RCK Dispatch. If pay must be genuinely secret from
  // supervisors, the app needs a real account for the director instead.
  directorPin: '',

  // Clear the screen after this many minutes with nothing happening, so a
  // phone left on a seat doesn't leave someone's file on display. Carrying
  // on is one tap. Set to 0 to never clear it.
  idleLockMinutes: 20,

  // How many days before an expiry date something turns amber, for tiles
  // that don't set their own window.
  defaultWarnDays: 60
};
