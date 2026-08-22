import "dotenv/config";
import { createApp } from "./app";
import { startReminderScheduler } from "./lib/reminderScheduler";

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

const app = createApp();

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
  startReminderScheduler();
});
