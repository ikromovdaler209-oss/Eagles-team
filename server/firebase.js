
const {
  initializeApp,
  getApps,
  cert,
  applicationDefault
} = require("firebase-admin/app");

const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const PROJECT_ID = "eagles-community";

function init() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (raw) {
    const serviceAccount = JSON.parse(raw);

    if (serviceAccount.project_id !== PROJECT_ID) {
      throw new Error("Wrong Firebase project");
    }

    return initializeApp({
      credential: cert(serviceAccount),
      projectId: PROJECT_ID
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID
  });
}

const app = init();

module.exports = {
  app,
  db: getFirestore(app),
  auth: getAuth(app)
};
