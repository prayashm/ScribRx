/// <reference path="../pb_data/types.d.ts" />

// ScribRx PocketBase hooks.
//
// Adds two custom routes:
//   POST /api/parse-rx        (auth required) — server-side AI parsing, hides the Gemini key
//   GET  /api/verify/:rxId    (public)        — hosted prescription verification
//
// Configure the AI key once on the server:  GEMINI_API_KEY=...  (env var)

const GEMINI_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = `You are a medical prescription assistant for qualified Indian doctors.
You parse the doctor's voice notes or text messages into structured prescription data.

Rules:
- Extract both the diagnosis AND the medicines. Do not omit medicines when a diagnosis is provided.
- Name Age Gender pattern: if text looks like "Name Age Gender" (example: "Ayush 30 M"), treat it as patient demographics.
- Do not interpret demographics as medicine names or dosages.
- If demographic text could also be read as medicine data, keep medicine empty and add a short follow_up_questions clarification.
- Use Indian medicine naming conventions (brand names like Azee, Dolo, Crocin are valid).
- When a brand name is used, ALWAYS fill in the genericName field with the INN/generic equivalent. If the doctor already used the generic name, leave genericName empty.
- Extract complaints, symptoms, examination findings, and diagnosis only if the doctor mentions them. Never invent.
- "1-0-1" means morning-skip-evening. "0-0-1" means evening only.
- OD = once daily, BD = twice daily, TDS = thrice daily, QID = four times daily, SOS = as needed, HS = at bedtime.
- "x/7" notation: "3/7" means 3 days, "5/7" means 5 days, "2/52" means 2 weeks.
- Preserve ALL existing prescription data unless the doctor explicitly changes it.
- NEVER guess or invent information. Leave fields empty/omitted if not mentioned.
- In follow_up_questions, ask only about genuinely missing critical info, kept short.
- If the doctor's message answers a previous question, merge the answer into the existing data.`;

// Gemini structured-output schema mirroring PrescriptionDraftSchema (OpenAPI subset).
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    patient: {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
        gender: { type: "string", enum: ["M", "F", "Other"] },
        phone: { type: "string" },
      },
    },
    complaints: { type: "string" },
    symptoms: { type: "string" },
    examination: { type: "string" },
    diagnosis: { type: "string" },
    medicines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          genericName: { type: "string" },
          dosage: { type: "string" },
          frequency: { type: "string" },
          duration: { type: "string" },
          instructions: { type: "string" },
        },
        required: ["name"],
      },
    },
    lab_tests: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
    follow_up_questions: { type: "array", items: { type: "string" } },
  },
};

routerAdd("POST", "/api/parse-rx", (e) => {
  const auth = e.auth;
  if (!auth) {
    return e.json(401, { error: "Authentication required." });
  }

  const apiKey = $os.getenv("GEMINI_API_KEY");
  if (!apiKey) {
    return e.json(500, { error: "Server AI key not configured." });
  }

  const info = e.requestInfo();
  const body = info.body || {};
  const currentState = body.currentState || null;
  const input = body.input;
  if (!input || (input.type !== "text" && input.type !== "audio")) {
    return e.json(400, { error: "Invalid input." });
  }

  // Build the user turn.
  const parts = [];
  if (currentState) {
    parts.push({
      text:
        "Current prescription state:\n" +
        JSON.stringify(currentState, null, 2) +
        "\n\nThe doctor has provided an update. Merge it with the existing state.",
    });
  } else {
    parts.push({
      text: "The doctor is starting a new prescription. Parse the following into a complete prescription.",
    });
  }

  if (input.type === "audio") {
    parts.push({ inline_data: { mime_type: input.mimeType, data: input.data } });
  } else {
    parts.push({ text: 'Doctor\'s update: "' + input.text + '"' });
  }

  const geminiBody = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  const res = $http.send({
    url:
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      GEMINI_MODEL +
      ":generateContent?key=" +
      apiKey,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(geminiBody),
    timeout: 30,
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    return e.json(502, { error: "AI provider error (" + res.statusCode + ")." });
  }

  let draft;
  try {
    const candidate = res.json.candidates[0];
    const text = candidate.content.parts[0].text;
    draft = JSON.parse(text);
  } catch (err) {
    return e.json(502, { error: "Failed to parse AI response." });
  }

  return e.json(200, { draft });
});

routerAdd("GET", "/api/verify/{rxId}", (e) => {
  const rxId = e.request.pathValue("rxId");
  let rec;
  try {
    rec = $app.findFirstRecordByFilter("prescriptions", "rxId = {:rxId}", { rxId });
  } catch (err) {
    return e.json(404, { error: "Not found." });
  }
  return e.json(200, {
    rxId: rec.getString("rxId"),
    doctorName: rec.getString("doctorName"),
    regNo: rec.getString("regNo"),
    date: rec.getString("finalizedAt") || rec.getString("createdAt"),
    patientInitials: rec.getString("patientInitials"),
    status: rec.getString("status"),
  });
});
