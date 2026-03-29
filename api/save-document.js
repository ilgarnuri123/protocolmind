const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userEmail, title, type, content } = req.body || {};

    if (!userEmail || !title || !type || !content) {
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    const normalizedEmail = String(userEmail).trim().toLowerCase();

    const profileResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(normalizedEmail)}&select=*`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!profileResponse.ok) {
      const errText = await profileResponse.text();
      return res.status(500).json({
        error: "Profile lookup failed",
        details: errText
      });
    }

    const profiles = await profileResponse.json();

    if (!profiles || profiles.length === 0) {
      return res.status(404).json({
        error: "User profile not found"
      });
    }

    const user = profiles[0];

    const createdAt = new Date().toISOString();

    const saveResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/documents`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          user_id: user.id,
          title,
          type,
          content,
          created_at: createdAt,
        }),
      }
    );

    if (!saveResponse.ok) {
      const errText = await saveResponse.text();
      return res.status(500).json({
        error: "Document save failed",
        details: errText
      });
    }

    const saved = await saveResponse.json();

    return res.status(200).json({
      success: true,
      document: saved?.[0] || null
    });
  } catch (error) {
    console.error("SAVE DOCUMENT ERROR:", error);

    return res.status(500).json({
      error: "Server error",
      details: error.message
    });
  }
}
