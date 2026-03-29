const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userEmail } = req.body || {};

    if (!userEmail) {
      return res.status(400).json({
        error: "Missing userEmail"
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

    const docsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/documents?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!docsResponse.ok) {
      const errText = await docsResponse.text();
      return res.status(500).json({
        error: "Documents fetch failed",
        details: errText
      });
    }

    const documents = await docsResponse.json();

    return res.status(200).json({
      success: true,
      documents: documents || []
    });
  } catch (error) {
    console.error("GET DOCUMENTS ERROR:", error);

    return res.status(500).json({
      error: "Server error",
      details: error.message
    });
  }
}
