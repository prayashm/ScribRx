/// <reference path="../pb_data/types.d.ts" />

// Creates the ScribRx collections (profiles, prescriptions) with owner-scoped
// API rules. Bundled into the image and applied automatically on startup.
//
// Down-migration drops both collections.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const ownerRule = '@request.auth.id != "" && user = @request.auth.id';

    // -- profiles -----------------------------------------------------------
    const profiles = new Collection({
      type: "base",
      name: "profiles",
      listRule: ownerRule,
      viewRule: ownerRule,
      createRule: ownerRule,
      updateRule: ownerRule,
      deleteRule: ownerRule,
      fields: [
        {
          name: "user",
          type: "relation",
          required: true,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: "fullName", type: "text", required: true },
        { name: "designation", type: "text", required: true },
        { name: "regNumber", type: "text", required: true },
        { name: "clinicName", type: "text" },
        { name: "phone", type: "text" },
        { name: "signatureFont", type: "text" },
        { name: "signatureStyle", type: "text" },
        { name: "hmacSecret", type: "text" },
        // base64 image data — no length cap (max: 0)
        { name: "stampBase64", type: "text", max: 0 },
        { name: "signatureBase64", type: "text", max: 0 },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_profiles_user` ON `profiles` (`user`)",
      ],
    });
    app.save(profiles);

    // -- prescriptions ------------------------------------------------------
    const prescriptions = new Collection({
      type: "base",
      name: "prescriptions",
      listRule: ownerRule,
      viewRule: ownerRule,
      createRule: ownerRule,
      updateRule: ownerRule,
      deleteRule: ownerRule,
      fields: [
        {
          name: "user",
          type: "relation",
          required: true,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: "rxId", type: "text", required: true },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["draft", "finalized", "cancelled"],
        },
        { name: "createdAt", type: "text" },
        { name: "finalizedAt", type: "text" },
        { name: "cancelledAt", type: "text" },
        // full structured prescription (patient, medicines, labTests, …)
        { name: "data", type: "json", maxSize: 2000000 },
        {
          name: "pdf",
          type: "file",
          maxSelect: 1,
          maxSize: 10485760, // 10 MB
          mimeTypes: ["application/pdf"],
        },
        // public-safe verification fields (exposed only via /api/verify)
        { name: "doctorName", type: "text" },
        { name: "regNo", type: "text" },
        { name: "patientInitials", type: "text" },
      ],
      // rxId is per-doctor unique (the counter is scoped per user), so the
      // unique index is composite on (user, rxId) rather than rxId alone.
      indexes: [
        "CREATE UNIQUE INDEX `idx_presc_user_rxid` ON `prescriptions` (`user`, `rxId`)",
        "CREATE INDEX `idx_presc_rxid` ON `prescriptions` (`rxId`)",
      ],
    });
    app.save(prescriptions);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("prescriptions"));
    app.delete(app.findCollectionByNameOrId("profiles"));
  }
);
