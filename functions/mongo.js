const { MongoClient } = require("mongodb");

let clientPromise;

function getMongoClient() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured.");
  }
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI, {
      appName: "spark-stack-academy"
    });
    clientPromise = client.connect();
  }
  return clientPromise;
}

async function getDb() {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB || "spark_stack_academy");
}

async function ensurePaymentIndexes(db) {
  await Promise.all([
    db.collection("payments").createIndex({ internalReference: 1 }, { unique: true }),
    db.collection("payments").createIndex({ checkoutRequestId: 1 }, { unique: true, sparse: true }),
    db.collection("payments").createIndex({ merchantRequestId: 1 }, { sparse: true }),
    db.collection("payments").createIndex({ studentId: 1, createdAt: -1 }),
    db.collection("payment_events").createIndex({ eventKey: 1 }, { unique: true }),
    db.collection("enrollments").createIndex({ studentId: 1, courseId: 1 }, { unique: true })
  ]);
}

module.exports = { getMongoClient, getDb, ensurePaymentIndexes };
