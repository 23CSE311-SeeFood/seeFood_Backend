const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const prisma = require("../../lib/prisma");

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
    redirectAllowlist: process.env.MS_APP_REDIRECT_ALLOWLIST || "",
  };
}

function parseRedirect(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isAllowedRedirect(candidate, allowlist) {
  for (const allowed of allowlist) {
    if (
      candidate.protocol === allowed.protocol &&
      candidate.host === allowed.host &&
      candidate.pathname.startsWith(allowed.pathname)
    ) {
      return true;
    }
  }
  return false;
}

router.get("/login", (req, res) => {
  const { clientId, redirectUri, scopes, appRedirect, redirectAllowlist } = getConfig();
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: "Microsoft OAuth not configured" });
  }

  if (!appRedirect) {
    return res.status(400).json({ error: "Missing app redirect" });
  }

  const baseRedirect = parseRedirect(appRedirect);
  if (!baseRedirect) {
    return res.status(500).json({ error: "Invalid app redirect config" });
  }

  const allowlist = [baseRedirect];
  if (redirectAllowlist) {
    for (const entry of redirectAllowlist.split(",")) {
      const parsed = parseRedirect(entry.trim());
      if (parsed) allowlist.push(parsed);
    }
  }

  const requestedRedirect = String(req.query.redirect || "").trim();
  let finalRedirect = appRedirect;
  if (requestedRedirect) {
    const parsed = parseRedirect(requestedRedirect);
    if (!parsed || !isAllowedRedirect(parsed, allowlist)) {
      return res.status(400).json({ error: "Invalid redirect" });
    }
    finalRedirect = parsed.toString();
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

  const { code, state, error, error_description } = req.query;
  if (error) {
    return res
      .status(400)
      .json({ error: "Microsoft auth error", details: error_description || error });
  }
  if (!code || !state) {
    return res.status(400).json({ error: "Missing code or state" });
  }

  const statePayload = verifyState(state);
  if (!statePayload || !statePayload.ts || !statePayload.redirect) {
    return res.status(400).json({ error: "Invalid state" });
  }
  if (Date.now() - statePayload.ts > STATE_TTL_MS) {
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
      return res.status(400).json({ error: "Token exchange failed", details: tokenData });
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return res.status(400).json({ error: "Missing access token" });
    }

    const meResp = await fetchFn("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const me = await meResp.json();
    if (!meResp.ok) {
      return res.status(400).json({ error: "Failed to fetch profile", details: me });
    }

    const email = (me.mail || me.userPrincipalName || "").toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Microsoft account missing email" });
    }

    let student = await prisma.student.findUnique({ where: { email } });
    if (!student) {
      const randomPassword = crypto.randomBytes(16).toString("hex");
      const hash = await bcrypt.hash(randomPassword, 10);
      student = await prisma.student.create({
        data: {
          name: me.displayName || me.givenName || email,
          email,
          number: null,
          branch: null,
          rollNumber: null,
          password: hash,
        },
      });
    }

    const jwtSecret = process.env.JWT_SECRET || "";
    if (!jwtSecret) {
      return res.status(500).json({ error: "JWT secret not configured" });
    }

    const appToken = jwt.sign(
      {
        sub: student.id,
        email: student.email,
        name: student.name,
      },
      jwtSecret,
      { expiresIn: "7d" }
    );

    const redirectUrl = new URL(statePayload.redirect);
    const hashParams = new URLSearchParams(
      redirectUrl.hash ? redirectUrl.hash.replace(/^#/, "") : ""
    );
    hashParams.set("token", appToken);
    redirectUrl.hash = hashParams.toString();
    res.redirect(redirectUrl.toString());
  } catch (err) {
    res.status(500).json({ error: "Microsoft auth failed" });
  }
});

module.exports = router;
