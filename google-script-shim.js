/**
 * Capa de compatibilidad para conservar el frontend creado para Google Apps Script.
 * Convierte google.script.run.metodo(...) en solicitudes al Worker de Cloudflare.
 */
(() => {
  const createRunner = (successHandler = null, failureHandler = null) => new Proxy({}, {
    get(_target, property) {
      if (property === "withSuccessHandler") {
        return handler => createRunner(handler, failureHandler);
      }

      if (property === "withFailureHandler") {
        return handler => createRunner(successHandler, handler);
      }

      if (property === "then") return undefined;

      return async (...args) => {
        try {
          const response = await fetch("/api/rpc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ method: String(property), args })
          });

          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.ok === false) {
            throw new Error(payload.error || payload.message || `Error HTTP ${response.status}`);
          }

          if (typeof successHandler === "function") successHandler(payload.result);
          return payload.result;
        } catch (error) {
          const normalized = error instanceof Error ? error : new Error(String(error));
          if (typeof failureHandler === "function") {
            failureHandler(normalized);
            return undefined;
          }
          console.error(normalized);
          throw normalized;
        }
      };
    }
  });

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, "run", {
    configurable: false,
    enumerable: true,
    get() {
      return createRunner();
    }
  });
})();
