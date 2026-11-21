/* Shared Firebase init + Microsoft sign-in for index.html and scheduler.html.
   Loaded as a classic script after js/paket-config.js and js/escape-html.js. */
(function (global) {
    var cfg = global.PAKET_CONFIG;
    if (!cfg || !cfg.firebase) {
        throw new Error("js/paket-config.js must load before js/paket-firebase.js");
    }

    var PLACEHOLDER_TENANT = "YOUR_PAKET_TENANT_ID";
    var EMULATOR_TENANT = "00000000-0000-0000-0000-000000000001";
    var listeners = [];
    var readyListeners = [];
    var db = null;
    var usingEmulators = false;
    var started = false;
    var authSettled = false;
    var currentUser = null;
    var currentIsAdmin = false;
    var lastError = null;
    var stickyError = null;
    var popupResult = null;

    function escapeHtml(value) {
        if (global.PaketEscape && global.PaketEscape.escapeHtml) {
            return global.PaketEscape.escapeHtml(value);
        }
        return String(value == null ? "" : value);
    }

    /* Realtime Database keys cannot contain . # $ / [ ] or be empty.
       Line codes such as BLT#2 are real Paket names, so encode them only
       while the value is stored and decode them as soon as it is read. */
    function encodeFirebaseKey(key) {
        return String(key)
            .replace(/~/g, "~t~")
            .replace(/\./g, "~d~")
            .replace(/#/g, "~h~")
            .replace(/\$/g, "~s~")
            .replace(/\//g, "~f~")
            .replace(/\[/g, "~l~")
            .replace(/\]/g, "~r~")
            .replace(/^$/, "~empty~");
    }

    function decodeFirebaseKey(key) {
        if (key === "~empty~") return "";
        return String(key)
            .replace(/~r~/g, "]")
            .replace(/~l~/g, "[")
            .replace(/~f~/g, "/")
            .replace(/~s~/g, "$")
            .replace(/~h~/g, "#")
            .replace(/~d~/g, ".")
            .replace(/~t~/g, "~");
    }

    function encodeFirebaseKeys(value) {
        if (Array.isArray(value)) return value.map(encodeFirebaseKeys);
        if (value && typeof value === "object") {
            var out = {};
            Object.keys(value).forEach(function (key) {
                out[encodeFirebaseKey(key)] = encodeFirebaseKeys(value[key]);
            });
            return out;
        }
        return value;
    }

    function decodeFirebaseKeys(value) {
        if (Array.isArray(value)) return value.map(decodeFirebaseKeys);
        if (value && typeof value === "object") {
            var out = {};
            Object.keys(value).forEach(function (key) {
                out[decodeFirebaseKey(key)] = decodeFirebaseKeys(value[key]);
            });
            return out;
        }
        return value;
    }

    function isLocalHost() {
        var host = global.location && global.location.hostname;
        return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
    }

    function shouldUseEmulators() {
        if (!isLocalHost() || !global.location) return false;
        var params = new URLSearchParams(global.location.search);
        return params.get("emulators") === "1";
    }

    function configuredTenant() {
        var tenant = String(cfg.microsoftTenantId || "").trim();
        if (!tenant || tenant === PLACEHOLDER_TENANT) return null;
        return tenant;
    }

    function expectedTenant() {
        return configuredTenant() || (usingEmulators ? EMULATOR_TENANT : null);
    }

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var existing = document.querySelector('script[src="' + src + '"]');
            if (existing && existing.dataset.loaded === "1") {
                resolve();
                return;
            }
            var s = existing || document.createElement("script");
            s.src = src;
            s.onload = function () { s.dataset.loaded = "1"; resolve(); };
            s.onerror = function () { reject(new Error("Failed to load " + src)); };
            if (!existing) document.head.appendChild(s);
        });
    }

    function ensureSdk() {
        if (typeof firebase !== "undefined" && firebase.auth && firebase.database) {
            return Promise.resolve();
        }
        var base = "https://www.gstatic.com/firebasejs/10.12.0/";
        return loadScript(base + "firebase-app-compat.js")
            .then(function () { return loadScript(base + "firebase-auth-compat.js"); })
            .then(function () { return loadScript(base + "firebase-database-compat.js"); });
    }

    function base64UrlJson(obj) {
        var json = JSON.stringify(obj);
        var bytes = new TextEncoder().encode(json);
        var bin = "";
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    function emulatorIdToken(profile) {
        var header = base64UrlJson({ alg: "none", typ: "JWT" });
        var body = base64UrlJson({
            sub: profile.sub || "emulator-user",
            name: profile.name || "Paket Emulator",
            email: profile.email || "planner@paket.test",
            email_verified: true,
            tid: profile.tid,
            oid: profile.sub || "emulator-user",
            iss: "https://login.microsoftonline.com/" + profile.tid + "/v2.0",
            aud: cfg.firebase.appId
        });
        return header + "." + body + ".";
    }

    function readTid(user, result) {
        var profile = result && result.additionalUserInfo && result.additionalUserInfo.profile;
        if (profile && (profile.tid || profile.TID)) return profile.tid || profile.TID;
        return user.getIdTokenResult().then(function (token) {
            var claims = token && token.claims ? token.claims : {};
            var attrs = (claims.firebase && claims.firebase.sign_in_attributes) || {};
            return attrs.tid || claims.tid || null;
        });
    }

    function providerOf(user) {
        return user.getIdTokenResult().then(function (token) {
            var firebaseClaim = token && token.claims && token.claims.firebase;
            return (firebaseClaim && firebaseClaim.sign_in_provider) || "";
        });
    }

    function emailAllowed(user) {
        var domain = String(cfg.allowedEmailDomain || "").trim().toLowerCase().replace(/^@/, "");
        if (!domain) return true;
        var email = String(user.email || "").toLowerCase();
        return email.endsWith("@" + domain);
    }

    /* Returns a Promise<string|null>: null means the session may continue. */
    function tenantProblem(user, result) {
        var expected = expectedTenant();
        if (!usingEmulators && !configuredTenant()) {
            return Promise.resolve("Microsoft sign-in is not configured yet. Paste the Paket tenant ID into js/paket-config.js (microsoftTenantId), then redeploy.");
        }
        return providerOf(user).then(function (provider) {
            if (provider && provider !== "microsoft.com") {
                return "Sign-in has to use a Paket Microsoft 365 account.";
            }
            return Promise.resolve(readTid(user, result)).then(function (tid) {
                if (tid) {
                    if (expected && String(tid).toLowerCase() !== String(expected).toLowerCase()) {
                        return "This Microsoft account is not in the Paket tenant.";
                    }
                    if (!emailAllowed(user)) {
                        return "Sign-in is limited to @" + String(cfg.allowedEmailDomain).replace(/^@/, "") + " accounts.";
                    }
                    return null;
                }
                /* Restored sessions often omit the Entra tenant id (tid).
                   The Entra app must be single-tenant; that is what blocks other companies.
                   Emulator tokens always include tid, so a missing tid there is a failure. */
                if (usingEmulators) return "Emulator sign-in did not include a tenant id.";
                if (!emailAllowed(user)) {
                    return "Sign-in is limited to @" + String(cfg.allowedEmailDomain).replace(/^@/, "") + " accounts.";
                }
                return null;
            });
        });
    }

    function emit() {
        var snapshot = {
            user: currentUser,
            isAdmin: currentIsAdmin,
            error: lastError,
            usingEmulators: usingEmulators,
            ready: authSettled
        };
        listeners.forEach(function (fn) {
            try { fn(snapshot); } catch (err) { console.error(err); }
        });
    }

    function loadAdminFlag(user) {
        if (!db || !user) return Promise.resolve(false);
        return db.ref("admins/" + user.uid).once("value").then(function (snap) {
            return snap.val() === true;
        }).catch(function () { return false; });
    }

    function applyUser(user, result) {
        if (!user) {
            currentUser = null;
            currentIsAdmin = false;
            lastError = stickyError;
            stickyError = null;
            authSettled = true;
            emit();
            return Promise.resolve();
        }
        return tenantProblem(user, result || null).then(function (problem) {
            if (problem) {
                stickyError = new Error(problem);
                return firebase.auth().signOut();
            }
            return loadAdminFlag(user).then(function (isAdmin) {
                currentUser = user;
                currentIsAdmin = isAdmin;
                lastError = null;
                authSettled = true;
                emit();
            });
        });
    }

    function signInMicrosoft() {
        var tenant = configuredTenant();
        if (!tenant) {
            return Promise.reject(new Error("Microsoft sign-in is not configured yet. Paste the Paket tenant ID into js/paket-config.js (microsoftTenantId), then redeploy."));
        }
        var provider = new firebase.auth.OAuthProvider("microsoft.com");
        provider.setCustomParameters({
            tenant: tenant,
            prompt: "select_account"
        });
        return firebase.auth().signInWithPopup(provider).then(function (result) {
            /* The auth listener runs before this promise resolves. It waits
               one tick so this assignment is visible when the tenant is checked. */
            popupResult = result;
            return result.user;
        }).catch(function (err) {
            if (err && err.code === "auth/popup-blocked") {
                return firebase.auth().signInWithRedirect(provider);
            }
            throw err;
        });
    }

    function signInWithEmulatorProfile(profile) {
        if (!usingEmulators) {
            return Promise.reject(new Error("Emulator sign-in is only available on localhost with ?emulators=1."));
        }
        var tid = profile.tid || expectedTenant();
        var provider = new firebase.auth.OAuthProvider("microsoft.com");
        var credential = provider.credential({
            idToken: emulatorIdToken({
                sub: profile.sub || "emulator-user",
                email: profile.email || "planner@paket.test",
                name: profile.name || "Paket Emulator",
                tid: tid
            }),
            accessToken: "emulator-access-token"
        });
        return firebase.auth().signInWithCredential(credential).then(function (result) {
            popupResult = result;
            return result.user;
        });
    }

    function signIn() {
        if (usingEmulators) {
            return signInWithEmulatorProfile({ tid: expectedTenant() });
        }
        return signInMicrosoft();
    }

    function signOut() {
        return firebase.auth().signOut();
    }

    function onAuth(fn) {
        listeners.push(fn);
        if (authSettled) {
            fn({
                user: currentUser,
                isAdmin: currentIsAdmin,
                error: lastError,
                usingEmulators: usingEmulators,
                ready: true
            });
        }
    }

    function onReady(fn) {
        readyListeners.push(fn);
        if (started && db) fn({ usingEmulators: usingEmulators, db: db });
    }

    function init() {
        if (started) return Promise.resolve();
        started = true;
        return ensureSdk().then(function () {
            if (!firebase.apps.length) firebase.initializeApp(cfg.firebase);
            usingEmulators = shouldUseEmulators();
            if (usingEmulators) {
                firebase.auth().useEmulator("http://127.0.0.1:9099");
                firebase.database().useEmulator("127.0.0.1", 9000);
            }
            db = firebase.database();
            readyListeners.forEach(function (fn) {
                try { fn({ usingEmulators: usingEmulators, db: db }); } catch (err) { console.error(err); }
            });
            return firebase.auth().getRedirectResult().catch(function (err) {
                console.warn("Microsoft redirect result:", err && err.message ? err.message : err);
                return null;
            });
        }).then(function (redirectResult) {
            firebase.auth().onAuthStateChanged(function (user) {
                /* setTimeout yields to the popup promise, which records popupResult
                   before we decide whether the tenant is allowed. */
                setTimeout(function () {
                    var result = null;
                    if (popupResult && user && popupResult.user && popupResult.user.uid === user.uid) {
                        result = popupResult;
                        popupResult = null;
                    } else if (redirectResult && user && redirectResult.user && redirectResult.user.uid === user.uid) {
                        result = redirectResult;
                        redirectResult = null;
                    }
                    applyUser(user, result);
                }, 0);
            });
        }).catch(function (err) {
            authSettled = true;
            lastError = err;
            emit();
            console.error("Firebase init failed:", err);
        });
    }

    global.Paket = {
        escapeHtml: escapeHtml,
        encodeFirebaseKeys: encodeFirebaseKeys,
        decodeFirebaseKeys: decodeFirebaseKeys,
        init: init,
        onAuth: onAuth,
        onReady: onReady,
        signIn: signIn,
        signOut: signOut,
        db: function () { return db; },
        user: function () { return currentUser; },
        isAdmin: function () { return currentIsAdmin; },
        usingEmulators: function () { return usingEmulators; },
        config: cfg,
        /* Localhost emulator tests only. Ignored unless ?emulators=1 on localhost. */
        _emulatorSignIn: signInWithEmulatorProfile
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () { init(); });
    } else {
        init();
    }
})(window);
