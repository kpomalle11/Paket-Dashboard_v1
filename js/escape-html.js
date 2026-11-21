/* Shared HTML escaping for text that is inserted into the page.
   Works in the browser (global PaketEscape) and in Node tests (module.exports). */
(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.PaketEscape = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
    return { escapeHtml: escapeHtml };
});
