/* ---------------------------------------------------------------------
   RCK Dispatch — site configuration.

   WARNING: this repository and the published site are PUBLIC. Anything
   written below is readable by anyone who finds the page. The Supabase key
   is therefore deliberately left blank — each device is given the Project
   URL and anon key once, in the app's Settings screen (or by tapping a
   setup link), so the key never appears on a public page.

     Supabase → Settings → API
       supabaseUrl = "Project URL"
       supabaseKey = the "anon / public" key   (NEVER the service_role key)
--------------------------------------------------------------------- */
window.RCKD_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',

  // What appears on the letterhead of every printed report. Taken from the
  // RCK quote; change a number here and it changes on every document.
  brand: {
    name:  'RCK NZ',
    trade: 'Asphalt & Civil Contracting',
    email: 'office@rcknz.co.nz',
    phone: ''
  },

  // Optional. If set, switching a device into Office or Director mode asks
  // for this code first, so a site phone can't create or delete jobs by
  // accident. It is a speed bump, not a password — the code is in this file.
  officePin: ''
};
