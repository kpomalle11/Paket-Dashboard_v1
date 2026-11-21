/* =============================================================================
   PAKET CONFIG — Kevin edits this file.

   microsoftTenantId
     Paste the Tenant ID from the Azure portal:
     Microsoft Entra ID → Overview → Tenant ID.
     It looks like: 12345678-1234-1234-1234-123456789abc
     Sign-in is rejected when Microsoft reports a different tenant.
     Leave the placeholder below until you have the real id. The sign-in
     button will explain that it is not set yet.

   allowedEmailDomain
     Optional extra check, for example "paket.com".
     Leave "" to accept every account in the tenant.

   The Microsoft client secret does NOT go here. It goes in the Firebase
   console (Authentication → Sign-in method → Microsoft). This file is public
   to anyone who can load the site; the apiKey below is a Firebase web key,
   not a secret.
   ============================================================================= */
window.PAKET_CONFIG = {
    microsoftTenantId: "YOUR_PAKET_TENANT_ID",
    allowedEmailDomain: "",
    firebase: {
        apiKey: "AIzaSyC-Xtlv__mvx-AEk8Zu9otkEFWYOF_mhbg",
        authDomain: "paket-production-dashboard-v1.firebaseapp.com",
        databaseURL: "https://paket-production-dashboard-v1-default-rtdb.firebaseio.com",
        projectId: "paket-production-dashboard-v1",
        storageBucket: "paket-production-dashboard-v1.firebasestorage.app",
        messagingSenderId: "869201529522",
        appId: "1:869201529522:web:3e9735a188236410f0d7ab",
        measurementId: "G-1CETQ69TZ8"
    }
};
