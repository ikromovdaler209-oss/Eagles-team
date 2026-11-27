"use strict";

// Trust only the configured number of hops, not arbitrary client-supplied
// X-Forwarded-* headers. Render puts the service behind a reverse proxy.
// Deployments with a different proxy chain must set TRUST_PROXY_HOPS explicitly.
function trustedProxyHops(env = process.env) {
  const supplied = env.TRUST_PROXY_HOPS;
  if (supplied === undefined || supplied === "") return env.RENDER === "true" ? 1 : 0;
  if (typeof supplied !== "string" || !/^[0-5]$/.test(supplied)) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 5");
  }
  return Number(supplied);
}

module.exports = {trustedProxyHops};
