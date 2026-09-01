/* ============================================================
   Pop & Go — Supabase client
   Loads the Supabase JS library from a CDN and creates one shared
   client that every page can use via window.sb.

   IMPORTANT: this used to hang forever (blank screen, dead buttons)
   if the CDN script or Supabase itself was unreachable — e.g. a VPN
   blocking the request. window.sbReady now times out after 8 seconds
   and rejects with a clear message, so calling code can show an error
   instead of waiting silently forever.
   ============================================================ */

(function () {
  "use strict";

  var SUPABASE_URL = "https://xzzpyjjqhaymhfusskvp.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enB5ampxaGF5bWhmdXNza3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNjkzMjQsImV4cCI6MjEwMzY0NTMyNH0.8mu1h8Npd8eWyOg71bEdixJ0034vkM5hooRcKSO18uU";

  var CONNECT_TIMEOUT_MS = 8000;

  function loadLibrary() {
    return new Promise(function (resolve, reject) {
      if (window.supabase) return resolve();
      var script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      script.onload = function () { resolve(); };
      script.onerror = function () {
        reject(new Error("Could not load the Supabase library from the CDN. Check your internet connection or VPN settings."));
      };
      document.head.appendChild(script);
    });
  }

  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error(message));
      }, ms);
      promise.then(
        function (val) { clearTimeout(timer); resolve(val); },
        function (err) { clearTimeout(timer); reject(err); }
      );
    });
  }

  // A promise that resolves with the Supabase client once it's ready to
  // use, or REJECTS (after CONNECT_TIMEOUT_MS) if the library can't load
  // or the client can't be created. Callers should catch this.
  window.sbReady = withTimeout(
    loadLibrary().then(function () {
      window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return window.sb;
    }),
    CONNECT_TIMEOUT_MS,
    "Could not connect to Supabase within " + (CONNECT_TIMEOUT_MS / 1000) +
      " seconds. This usually means a VPN or firewall is blocking the connection — try disabling your VPN for this site, or check your internet connection."
  );

  // Never let this show up as an unhandled promise rejection in the
  // console before something has a chance to .catch() it deliberately.
  window.sbReady.catch(function (err) {
    console.error("[Pop & Go] Supabase connection failed:", err.message);
  });
})();
