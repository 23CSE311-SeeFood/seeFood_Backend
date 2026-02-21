const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const DEFAULT_SCOPES = "openid profile email offline_access User.Read";
const STATE_TTL_MS = 10 * 60 * 1000;

const fetchFn = global.fetch
  ? global.fetch
  : (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

function getStateSecret() {
  return process.env.MS_STATE_SECRET || process.env.JWT_SECRET || "";
}

function signState(payload) {
  const secret = getStateSecret();
  if (!secret) return null;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyState(state) {
  const secret = getStateSecret();
  if (!secret) return null;
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (expected !== sig) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function getConfig() {
  return {
    clientId: process.env.MS_CLIENT_ID || "",
    clientSecret: process.env.MS_CLIENT_SECRET || "",
    redirectUri: process.env.MS_REDIRECT_URI || "",
    scopes: process.env.MS_SCOPES || DEFAULT_SCOPES,
    appRedirect: process.env.MS_APP_REDIRECT || "",
  };
}

router.get("/login", (req, res) => {
  const { clientId, redirectUri, scopes, appRedirect } = getConfig();
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: "Microsoft OAuth not configured" });
  }

  const requestedRedirect = String(req.query.redirect || "").trim();
  const finalRedirect = requestedRedirect || appRedirect;

  if (!finalRedirect) {
    return res.status(400).json({ error: "Missing app redirect" });
  }

  const state = signState({
    ts: Date.now(),
    redirect: finalRedirect,
  });
  if (!state) {
    return res.status(500).json({ error: "State secret not configured" });
  }

  const url = new URL(`${AUTHORITY}/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);

  res.redirect(url.toString());
});

router.get("/callback", async (req, res) => {
  const { clientId, clientSecret, redirectUri } = getConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(500).json({ error: "Microsoft OAuth not configured" });
  }

  console.log("got callback");
  const { code, state, error, error_description } = req.query;
  if (error) {
    console.log("error :",error)
    return res
      .status(400)
      .json({ error: "Microsoft auth error", details: error_description || error });
  }
  if (!code || !state) {
    console.log("no state");
    return res.status(400).json({ error: "Missing code or state" });
  }

  const statePayload = verifyState(state);
  if (!statePayload || !statePayload.ts || !statePayload.redirect) {
    console.log("error payload");
    return res.status(400).json({ error: "Invalid state" });
  }
  if (Date.now() - statePayload.ts > STATE_TTL_MS) {
      console.log("error expired");
    return res.status(400).json({ error: "State expired" });
  }

  try {
    const tokenResp = await fetchFn(`${AUTHORITY}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResp.json();

    if (!tokenResp.ok) {
      console.log("errors");
      return res.status(400).json({ error: "Token exchange failed", details: tokenData });
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      console.log("error payloads");
      return res.status(400).json({ error: "Missing access token" });
    }

    const meResp = await fetchFn("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const me = await meResp.json();
    if (!meResp.ok) {
      console.log("okays")
      return res.status(400).json({ error: "Failed to fetch profile", details: me });
    }

    const jwtSecret = process.env.JWT_SECRET || "";
    if (!jwtSecret) {
      return res.status(500).json({ error: "JWT secret not configured" });
    }

    console.log(me);
    const appToken = jwt.sign(
      {
        sub: `ms:${me.id}`,
        email: me.mail || me.userPrincipalName || null,
        name: me.displayName || null,
        provider: "microsoft",
      },
      jwtSecret,
      { expiresIn: "7d" }
    );

    const redirectUrl = new URL(statePayload.redirect);
    redirectUrl.searchParams.set("token", appToken);
    res.redirect(redirectUrl.toString());
  } catch (err) {
    res.status(500).json({ error: "Microsoft auth failed" });
  }
});

module.exports = router;
