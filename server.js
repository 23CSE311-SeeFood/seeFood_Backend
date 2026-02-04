const express = require("express");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Express server running" });
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
