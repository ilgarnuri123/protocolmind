import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LEMONSQUEEZY_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

async function updateUserPlanByEmail(email, subscriptionId, customerId, status) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Missing email");
  }

  const findResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(normalizedEmail)}&select=*`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  if (!findResponse.ok) {
    const errText = await findResponse.text();
    throw new Error("Supabase find error: " + errText);
  }

  const users = await findResponse.json();

  if (!users || users.length === 0) {
    throw new Error("User not found for email: " + normalizedEmail);
  }

  const user = users[0];

  const updateResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        email: normalizedEmail,
        plan: status === "active" ? "pro" : "free",
        status: status,
        lemonsqueezy_customer_id: customerId || null,
        lemonsqueezy_subscription_id: subscriptionId || null,
      }),
    }
  );

  if (!updateResponse.ok) {
    const errText = await updateResponse.text();
    throw new Error("Supabase update error: " + errText);
  }

  return await updateResponse.json();
}

function verifySignature(rawBody, signature, secret) {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = hmac.update(rawBody, "utf8").digest("hex");
  return digest === signature;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  return await new Promise((resolve, reject) => {
    let data = "";

    req.on("data", chunk => {
      data += chunk;
    });

    req.on("end", () => {
      resolve(data);
    });

    req.on("error", err => {
      reject(err);
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers["x-signature"];

    if (!signature) {
      return res.status(400).json({ error: "Missing signature header" });
    }

    if (
      !verifySignature(
        rawBody,
        signature,
        LEMONSQUEEZY_WEBHOOK_SECRET
      )
    ) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const payload = JSON.parse(rawBody);

    const eventName = payload.meta?.event_name || "";
    const attributes = payload.data?.attributes || {};

    let email =
      attributes.user_email ||
      attributes.customer_email ||
      attributes.email ||
      payload.meta?.custom_data?.email ||
      "";

    email = String(email).trim().toLowerCase();

    const subscriptionId =
      payload.data?.id ||
      attributes.subscription_id ||
      null;

    const customerId =
      attributes.customer_id ||
      attributes.customer?.id ||
      null;

    let status = "inactive";

    if (
      eventName === "subscription_created" ||
      eventName === "subscription_updated" ||
      eventName === "order_created"
    ) {
      status = "active";
    }

    if (
      eventName === "subscription_cancelled" ||
      eventName === "subscription_expired" ||
      eventName === "subscription_paused"
    ) {
      status = "inactive";
    }

    if (!email) {
      return res.status(400).json({
        error: "Could not determine customer email from webhook payload",
      });
    }

    const result = await updateUserPlanByEmail(
      email,
      subscriptionId,
      customerId,
      status
    );

    return res.status(200).json({
      success: true,
      event: eventName,
      email,
      status,
      result,
    });
  } catch (error) {
    console.error("WEBHOOK ERROR:", error);

    return res.status(500).json({
      error: "Webhook processing failed",
      details: error.message,
    });
  }
}
