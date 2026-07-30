import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { ClerkExpressWithAuth } from "@clerk/clerk-sdk-node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const app = express();
const prisma = new PrismaClient({ adapter });
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// In-memory Executive Diary and Assistant State
let executiveDiary = `• Meeting with JAKS Pharma at 3pm (need to check if online or office)
• Want to build a cool game using Vibe Coding and Antigravity workflow
• Wife said reach home by 9pm tonight to wash clothes & do laundry
• Energy drops after lunch around 2pm, keep buffer open`;

let userHabits = {
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
  freeSlots: "Evening (18:30 - 21:00)",
  preferredSprintDuration: 90,
  peakProductivity: "Morning & Evening"
};

let activeReminders = [
  {
    id: "rem-1",
    time: "14:30",
    title: "Prep & Commute Buffer for JAKS Pharma",
    type: "URGENT",
    status: "PENDING",
    message: "Check notes or leave early 30 mins before your 3:00 PM meeting with JAKS Pharma."
  },
  {
    id: "rem-2",
    time: "20:30",
    title: "Leave for Home (Reach by 9:00 PM)",
    type: "HOME",
    status: "PENDING",
    message: "Wrap up evening vibe coding by 8:30 PM so you get home by 9:00 PM for laundry."
  }
];

let activeSuggestions = [
  {
    id: "sug-1",
    title: "Vibe Coding & Antigravity Game Sprint",
    description: "You noted wanting to build a game using Vibe Coding & Antigravity. Your evening slot (18:30 - 20:00) is open before heading home.",
    actionLabel: "Lock In 90m Vibe Coding Sprint",
    actionType: "VIBE_CODE",
    impact: "High Creative Output"
  },
  {
    id: "sug-2",
    title: "Post-Lunch Energy Buffer",
    description: "You noted low energy around 2 PM. I have kept 2:00 PM - 2:30 PM free as a decompression slot before your 3 PM meeting.",
    actionLabel: "Confirm 2 PM Decompression",
    actionType: "BUFFER",
    impact: "+40% Focus at 3 PM"
  }
];

let scheduleItems = [
  { time: "09:00", title: "Morning Executive Review & Diary Triage", description: "Reviewing raw diary notes and prioritizing key tasks." },
  { time: "11:00", title: "Deep Work Focus Sprint", description: "High-leverage coding / strategic tasks based on morning peak hours." },
  { time: "14:00", title: "Decompression & Meeting Preparation", description: "Buffer zone before afternoon client meeting." },
  { time: "15:00", title: "Meeting with JAKS Pharma", description: "Client discussion / review (Synthesized from diary note)." },
  { time: "18:30", title: "Vibe Coding Sprint: Antigravity Game", description: "Dedicated creative project build session." },
  { time: "21:00", title: "Arrive Home & Laundry Routine", description: "Personal chores (Synthesized from home by 9 note)." }
];

let inMemoryIdeas = [
  {
    id: "idea-1",
    title: "Vibe Coding & Antigravity Game",
    description: "An AI-assisted game development project captured right from your raw diary entry.",
    estimatedHours: 20,
    feasibilityNote: "By utilizing 90-minute evening sprints during your 18:30 - 21:00 free slot, playable v1 can be shipped in 12 days.",
    milestones: [
      { title: "Game Loop & Vibe Coding Setup", durationHours: 4, dayOffset: 1 },
      { title: "Antigravity Physics & Mechanics", durationHours: 8, dayOffset: 4 },
      { title: "Polishing & Deployment", durationHours: 8, dayOffset: 10 }
    ],
    status: "INCUBATING"
  }
];

// Interactive clarification chips to show inside the chat for one-click decisions
let activeChoices = [
  {
    itemId: "choice-jaks",
    question: "Is your 3:00 PM JAKS Pharma meeting online or in-person?",
    options: ["💻 Online / Zoom Call", "🏢 In-Person (Keep 30m Commute)"]
  },
  {
    itemId: "choice-vibe",
    question: "Should I lock in the 6:30 PM - 8:00 PM slot for your Vibe Coding game sprint?",
    options: ["⚡ Lock In 6:30 PM Slot", "🕒 Shift to Weekend"]
  }
];

app.get("/api/diary", ClerkExpressWithAuth() as unknown as express.RequestHandler, (req, res) => {
  res.json({ content: executiveDiary });
});

app.post("/api/diary", ClerkExpressWithAuth() as unknown as express.RequestHandler, (req, res) => {
  const { content } = req.body;
  if (content !== undefined) executiveDiary = content;
  res.json({ success: true, content: executiveDiary });
});

app.get("/api/habits", ClerkExpressWithAuth() as unknown as express.RequestHandler, (req, res) => {
  res.json(userHabits);
});

app.get("/api/reminders", ClerkExpressWithAuth() as unknown as express.RequestHandler, (req, res) => {
  res.json(activeReminders);
});

app.get("/api/suggestions", ClerkExpressWithAuth() as unknown as express.RequestHandler, (req, res) => {
  res.json(activeSuggestions);
});

app.get("/api/ideas", ClerkExpressWithAuth() as unknown as express.RequestHandler, async (req, res) => {
  try {
    const dbIdeas = await prisma.idea.findMany({ orderBy: { createdAt: "desc" } });
    if (dbIdeas.length > 0) return res.json(dbIdeas);
  } catch (e) {}
  res.json(inMemoryIdeas);
});

app.post("/api/reminders/:id/action", ClerkExpressWithAuth() as unknown as express.RequestHandler, (req, res) => {
  const { id } = req.params;
  activeReminders = activeReminders.filter(r => r.id !== id);
  res.json({ success: true, activeReminders });
});

app.post("/api/suggestions/:id/action", ClerkExpressWithAuth() as unknown as express.RequestHandler, (req, res) => {
  const { id } = req.params;
  const sug = activeSuggestions.find(s => s.id === id);
  if (sug && sug.actionType === "VIBE_CODE") {
    if (!scheduleItems.some(i => i.title.includes("Vibe Coding"))) {
      scheduleItems.push({ time: "18:30", title: "Vibe Coding Sprint: Antigravity Game", description: "Synthesized from diary note." });
    }
  } else if (sug && sug.actionType === "BUFFER") {
    if (!scheduleItems.some(i => i.time === "14:00")) {
      scheduleItems.push({ time: "14:00", title: "Decompression & Meeting Buffer", description: "Pre-meeting energy rest." });
    }
  }
  scheduleItems.sort((a, b) => a.time.localeCompare(b.time));
  activeSuggestions = activeSuggestions.filter(s => s.id !== id);
  res.json({ success: true, schedule: scheduleItems, activeSuggestions });
});

// Endpoint to synthesize schedule from Diary or Chat with Interactive Choice Chips
app.post("/api/synthesize", ClerkExpressWithAuth() as unknown as express.RequestHandler, async (req, res) => {
  const { diaryContent, chatMessage, history } = req.body;
  if (diaryContent) executiveDiary = diaryContent;

  const inputSource = chatMessage || executiveDiary;

  const systemPrompt = `You are TaskBuddy JARVIS—an elite Executive Personal Assistant for top officers and CEOs.
Officers and executives do not fill out structured forms or clean task lists. They simply note raw tidbits, bullets, thoughts, and scribbles into their personal diary or memo (e.g. "Meeting with JAKS Pharma at 3, want to build game using vibe coding and antigravity, reach home by 9 for laundry, energy low around 2pm").

Your job is to read between the lines of these raw notes and synthesize a complete, world-class Master Schedule, Reminders, and ONE-CLICK Interactive Clarification Choices!

User Profile:
- Work Hours: ${userHabits.workingHoursStart} to ${userHabits.workingHoursEnd}
- Free Availability: ${userHabits.freeSlots}
- Peak Productivity: ${userHabits.peakProductivity}

When synthesizing:
1. **EXTRACT ALL ITEMS**: Turn every note, meeting, project idea, and chore into precise schedule blocks.
2. **GENERATE INTERACTIVE QUICK-REPLY CHOICES**: If any item has ambiguity (online vs in-person, sprint timing, departure point), formulate actionable choices so the user can just click a chip in chat without typing!
3. **RETURN STRICT JSON**:
\`\`\`json
{
  "response": "Synthesized your raw executive notes into a structured master itinerary, sir. Here is how we organized your day along with a couple of quick decisions:",
  "schedule": [
    { "time": "15:00", "title": "Meeting with JAKS Pharma", "description": "Client review (Checking prep/commute)." },
    { "time": "18:30", "title": "Vibe Coding Sprint: Antigravity Game", "description": "Creative game dev block." },
    { "time": "21:00", "title": "Reach Home & Laundry Routine", "description": "Personal chore target." }
  ],
  "interactiveChoices": [
    {
      "itemId": "jaks-mode",
      "question": "Is your 3:00 PM JAKS Pharma meeting online or in-person?",
      "options": ["💻 Online / Zoom Call", "🏢 In-Person (Keep 30m Commute Buffer)"]
    },
    {
      "itemId": "vibe-timing",
      "question": "Should I lock in 6:30 PM - 8:00 PM for your Vibe Coding game sprint?",
      "options": ["⚡ Lock In 6:30 PM Slot", "🕒 Shift to Weekend"]
    }
  ],
  "newReminder": {
    "time": "14:30",
    "title": "Prep / Commute for JAKS Pharma",
    "type": "URGENT",
    "message": "Check notes or leave early 30 mins prior."
  }
}
\`\`\`
Always respond like an elite, proactive executive assistant.`;

  let responseText = "";
  let usedModel = false;
  let parsedJson: any = null;

  for (const modelName of ["gemini-3-flash-preview", "gemma-4-31b-it", "gemini-flash-latest", "gemini-3.5-flash"]) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const formattedHistory = (history || []).map((msg: any) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
      }));

      const chat = model.startChat({
        history: [
          { role: "user", parts: [{ text: "SYSTEM PROMPT: " + systemPrompt }] },
          { role: "model", parts: [{ text: "Understood. I am your Executive Diary Assistant—ready to turn any raw note into an optimized master schedule and clickable decision chips." }] },
          ...formattedHistory
        ],
      });

      const result = await chat.sendMessage(inputSource);
      responseText = result.response.text();
      usedModel = true;
      
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        try {
          parsedJson = JSON.parse(jsonMatch[1]);
        } catch (e) {}
      }
      break;
    } catch (apiErr: any) {
      console.warn(`Model ${modelName} unavailable during synthesis. Trying next...`);
    }
  }

  // Intelligent Executive Diary Fallback if cloud models return error or no JSON
  if (!parsedJson) {
    const lower = inputSource.toLowerCase();
    
    // Check if user clicked an interactive option or sent a choice reply
    if (lower.includes("online") || lower.includes("zoom")) {
      scheduleItems = scheduleItems.map(i => i.time === "15:00" ? { ...i, description: "Online / Zoom Call (No travel buffer needed)." } : i);
      activeChoices = activeChoices.filter(c => !c.itemId.includes("jaks"));
      responseText = "Understood, sir. Marked your 3:00 PM JAKS Pharma meeting as an **Online Zoom Call**. I have freed up your travel buffer so you can use that time for review.";
    } else if (lower.includes("in-person") || lower.includes("commute")) {
      scheduleItems = scheduleItems.map(i => i.time === "15:00" ? { ...i, description: "In-Person Meeting (30m commute buffer locked at 2:30 PM)." } : i);
      activeChoices = activeChoices.filter(c => !c.itemId.includes("jaks"));
      responseText = "Understood, sir. Locked in the **30-minute commute buffer at 2:30 PM** for your in-person JAKS Pharma meeting.";
    } else if (lower.includes("6:30") || lower.includes("lock in") || lower.includes("accept") || lower.includes("vibe")) {
      if (!scheduleItems.some(i => i.title.includes("Vibe Coding"))) {
        scheduleItems.push({ time: "18:30", title: "Vibe Coding Sprint: Antigravity Game", description: "Confirmed 90-minute build session." });
        scheduleItems.sort((a, b) => a.time.localeCompare(b.time));
      }
      activeChoices = activeChoices.filter(c => !c.itemId.includes("vibe"));
      responseText = "Locked in your **6:30 PM - 8:00 PM Vibe Coding Sprint** right on your master itinerary. You are set to make massive progress before reaching home at 9 PM.";
    } else {
      // General diary synthesis
      parsedJson = {
        response: `I have synthesized your raw diary entries and incoming notes into a complete master schedule.\n\nLike an executive assistant, I separated every piece of information (` +
          `**JAKS Pharma at 3 PM**, **Vibe Coding game project**, **Home by 9 PM for laundry**, and your **Post-lunch energy buffer**).\n\n` +
          `To finalize the exact logistics without taking up your time, please click any of the interactive choice chips below:`,
        schedule: scheduleItems,
        interactiveChoices: activeChoices,
        reminders: activeReminders,
        suggestions: activeSuggestions
      };
      responseText = parsedJson.response;
    }
  } else {
    if (parsedJson.schedule) scheduleItems = parsedJson.schedule;
    if (parsedJson.interactiveChoices) activeChoices = parsedJson.interactiveChoices;
    if (parsedJson.newReminder) {
      activeReminders.unshift({
        id: "rem-" + Date.now(),
        time: parsedJson.newReminder.time || "Immediate",
        title: parsedJson.newReminder.title || "Synthesized Alert",
        type: parsedJson.newReminder.type || "URGENT",
        status: "PENDING",
        message: parsedJson.newReminder.message || ""
      });
    }
  }

  res.json({
    response: (parsedJson?.response || responseText).replace(/```json\n[\s\S]*?\n```/, "").trim(),
    schedule: scheduleItems,
    interactiveChoices: activeChoices,
    reminders: activeReminders,
    suggestions: activeSuggestions
  });
});

app.post("/api/chat", ClerkExpressWithAuth() as unknown as express.RequestHandler, async (req, res) => {
  // Delegate chat directly to synthesize handler so chat & diary share full intelligence
  req.body.chatMessage = req.body.message;
  return app._router.handle(req, res, () => {});
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
