const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { startEmailWorker } = require("./emailQueue");

let worker = null;

async function main() {
  try {
    worker = await startEmailWorker();
    console.log("Email worker started");
  } catch (error) {
    console.error("Failed to start email worker:", error);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  if (worker?.close) {
    await worker.close();
  }
  process.exit(0);
});

main();
