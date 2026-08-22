/* ---------------------------------------------------------------------
   RCK Costing — site configuration.

   WARNING: this repository and the published site are PUBLIC. Anything
   written below is readable by anyone who finds the page. The Supabase key
   is therefore deliberately left blank — the two devices that use this are
   given the Project URL and anon key once, in the app's Settings screen
   (or by tapping a setup link), so the key never appears on a public page.

   That matters more here than in the other apps: this one holds what every
   job made.

     Supabase → Settings → API
       supabaseUrl = "Project URL"
       supabaseKey = the "anon / public" key   (NEVER the service_role key)
--------------------------------------------------------------------- */
window.RCKC_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',

  // What appears on the letterhead of every printed sheet.
  brand: {
    name:  'RCK NZ',
    trade: 'Asphalt & Civil Contracting',
    email: 'office@rcknz.co.nz',
    phone: ''
  }
};
