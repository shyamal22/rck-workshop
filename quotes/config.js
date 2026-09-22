/* ---------------------------------------------------------------------
   RCK Quotes — what goes on the letterhead of every printed quote, and
   the two numbers a quote is built on.

   Nothing here is a secret, and nothing connects to anything: the app has
   no account, no server and no database. Every quote lives in the browser
   storage of the device it was entered on.

   Change a line below and it changes on every quote the app prints.
--------------------------------------------------------------------- */
window.RCKQ_CONFIG = {
  brand: {
    name:  'RCK NZ',
    trade: 'Asphalt & Civil Contracting',
    email: 'office@rcknz.co.nz',
    phone: ''
  },

  /* GST, as a rate. The app quotes ex GST and adds this on the printed
     page, the way the client's accounts department expects to read it. */
  gst: 0.15,

  /* How long a quote stands unless a job says otherwise. Editable on
     every quote; this is only where a new one starts. */
  validDays: 30,

  /* The conditions printed at the foot of every quote. One line each.
     Delete any that don't apply; add any that do. */
  terms: [
    'This quotation excludes GST unless stated otherwise.',
    'Pricing is based on the scope described above; variations to scope will be priced separately before work proceeds.',
    'Acceptance in writing, or a client order number, is required before work is programmed.',
    'Payment terms: 20th of the month following invoice.'
  ]
};
