const { auth, db } = require("./firebase");
(async () => {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  if (!email) throw new Error("Set ADMIN_BOOTSTRAP_EMAIL");
  const user = await auth.getUserByEmail(email);
  const ref = db.collection("users").doc(user.uid);
  await db.runTransaction(async tx => {
    const admins = db.collection("users").where("role", "==", "admin").limit(1);
    const snapshot = await tx.get(admins);
    if (!snapshot.empty) throw new Error("An admin already exists. Bootstrap disabled.");
    const profile = await tx.get(ref);
    if (!profile.exists) throw new Error("Register the admin profile through the website first");
    tx.update(ref, {role:"admin", approvalStatus:"approved", isActive:true});
  });
  console.log("Admin assigned:", user.uid);
  process.exit(0);
})().catch(err => { console.error(err.message); process.exit(1); });
