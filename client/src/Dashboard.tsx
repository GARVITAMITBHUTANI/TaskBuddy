import { useState, useRef, useEffect } from "react";
import { UserButton, useAuth, RedirectToSignIn, SignedIn, SignedOut } from "@clerk/clerk-react";
import { Send, Bot, User, CalendarDays, Loader2, Lightbulb, Clock, Sparkles, CheckCircle2, Bell, Zap, ShieldAlert, ArrowRight, Check, BookOpen, Edit3, RefreshCw } from "lucide-react";

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  choices?: { itemId: string; question: string; options: string[] }[];
};

type ScheduleItem = {
  time: string;
  title: string;
  description: string;
};

type Reminder = {
  id: string;
  time: string;
  title: string;
  type: string;
  status: string;
  message: string;
};

type Suggestion = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  actionType: string;
  impact?: string;
};

type InteractiveChoice = {
  itemId: string;
  question: string;
  options: string[];
};

export default function Dashboard() {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "ai",
      content: "Good day, sir! I am your Executive Diary Assistant & Master Scheduler.\n\nLike a real personal assistant for high-level officers, you don't need to fill out forms. Just drop any note, raw tidbit, bullet, or messy brain dump into your Executive Diary or chat below.\n\nI will read between the lines, connect the dots, and transform your notes into a conflict-free master schedule—with clickable quick-decision chips right below!",
      choices: [
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
      ]
    },
  ]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([
    { time: "09:00", title: "Morning Executive Review & Diary Triage", description: "Reviewing raw diary notes and prioritizing key tasks." },
    { time: "11:00", title: "Deep Work Focus Sprint", description: "High-leverage coding / strategic tasks based on morning peak hours." },
    { time: "14:00", title: "Decompression & Meeting Preparation", description: "Buffer zone before afternoon client meeting." },
    { time: "15:00", title: "Meeting with JAKS Pharma", description: "Client discussion / review (Synthesized from diary note)." },
    { time: "18:30", title: "Vibe Coding Sprint: Antigravity Game", description: "Dedicated creative project build session." },
    { time: "21:00", title: "Arrive Home & Laundry Routine", description: "Personal chores (Synthesized from home by 9 note)." }
  ]);
  const [reminders, setReminders] = useState<Reminder[]>([
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
  ]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([
    {
      id: "sug-1",
      title: "Vibe Coding & Antigravity Game Sprint",
      description: "You noted wanting to build a game using Vibe Coding & Antigravity. Your evening slot (18:30 - 20:00) is open before heading home.",
      actionLabel: "Lock In 90m Vibe Coding Sprint",
      actionType: "VIBE_CODE",
      impact: "High Creative Output"
    }
  ]);
  
  const [diaryContent, setDiaryContent] = useState(`• Meeting with JAKS Pharma at 3pm (need to check if online or office)
• Want to build a cool game using Vibe Coding and Antigravity workflow
• Wife said reach home by 9pm tonight to wash clothes & do laundry
• Energy drops after lunch around 2pm, keep buffer open`);
  
  const [activeTab, setActiveTab] = useState<"manager" | "schedule" | "diary" | "habits">("manager");
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch initial data
  const fetchAllData = async () => {
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [remRes, sugRes, diaryRes] = await Promise.all([
        fetch("http://localhost:5000/api/reminders", { headers }),
        fetch("http://localhost:5000/api/suggestions", { headers }),
        fetch("http://localhost:5000/api/diary", { headers })
      ]);
      if (remRes.ok) setReminders(await remRes.json());
      if (sugRes.ok) setSuggestions(await sugRes.json());
      if (diaryRes.ok) {
        const d = await diaryRes.json();
        if (d.content) setDiaryContent(d.content);
      }
    } catch (e) {
      console.error("Failed to fetch initial data", e);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Handle clicking an interactive choice chip right in the chat
  const handleChoiceClick = async (option: string) => {
    const newUserMsg: Message = { id: Date.now().toString(), role: "user", content: option };
    setMessages((prev) => [...prev, newUserMsg]);
    setIsTyping(true);

    try {
      const token = await getToken();
      const response = await fetch("http://localhost:5000/api/synthesize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatMessage: option,
          diaryContent,
          history: messages.slice(1).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      if (data.schedule && data.schedule.length > 0) setSchedule(data.schedule);
      if (data.reminders) setReminders(data.reminders);
      if (data.suggestions) setSuggestions(data.suggestions);

      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: data.response || "Confirmed! Master itinerary and travel buffers updated.",
        choices: data.interactiveChoices || []
      };
      setMessages((prev) => [...prev, aiResponse]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsTyping(false);
    }
  };

  // Synthesize schedule directly from the Executive Diary pad
  const handleSynthesizeDiary = async () => {
    setIsSynthesizing(true);
    try {
      const token = await getToken();
      const response = await fetch("http://localhost:5000/api/synthesize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          diaryContent,
          history: messages.slice(1).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      if (data.schedule && data.schedule.length > 0) setSchedule(data.schedule);
      if (data.reminders) setReminders(data.reminders);
      if (data.suggestions) setSuggestions(data.suggestions);

      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: data.response || "I have synthesized your raw diary notes into your updated master schedule and decision chips.",
        choices: data.interactiveChoices || []
      };
      setMessages((prev) => [...prev, aiResponse]);
      setActiveTab("schedule");
    } catch (e) {
      console.error(e);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newUserMsg: Message = { id: Date.now().toString(), role: "user", content: input };
    setMessages((prev) => [...prev, newUserMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const token = await getToken();
      const response = await fetch("http://localhost:5000/api/synthesize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatMessage: newUserMsg.content,
          diaryContent,
          history: messages.slice(1).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      if (data.schedule && data.schedule.length > 0) setSchedule(data.schedule);
      if (data.reminders) setReminders(data.reminders);
      if (data.suggestions) setSuggestions(data.suggestions);

      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: data.response || "Analyzed your input and updated your master schedule.",
        choices: data.interactiveChoices || []
      };
      setMessages((prev) => [...prev, aiResponse]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: "ai", content: "Error connecting to TaskBuddy backend." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      <SignedIn>
        <div className="h-screen bg-[#fafafa] flex flex-col md:flex-row font-sans overflow-hidden">
          {/* Left Panel: Chat Interface & Quick Capture */}
          <div className="flex-1 flex flex-col h-full border-r border-gray-200 bg-white">
            <header className="h-16 px-6 flex items-center justify-between border-b border-gray-100 shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center shadow-sm">
                  <Bot size={20} className="text-white" />
                </div>
                <div>
                  <h1 className="font-bold text-gray-900 tracking-tight text-base leading-none">TaskBuddy AI</h1>
                  <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Executive Diary Intelligence & Interactive Chips
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTab("diary")}
                  className="bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <BookOpen size={14} /> Open Executive Diary
                </button>
                <UserButton afterSignOutUrl="/" />
              </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-4 max-w-3xl ${msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}>
                  <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${msg.role === "user" ? "bg-gray-200" : "bg-black"}`}>
                    {msg.role === "user" ? <User size={16} className="text-gray-600" /> : <Bot size={16} className="text-white" />}
                  </div>
                  <div className="space-y-3 w-full">
                    <div className={`px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-sm whitespace-pre-wrap ${
                      msg.role === "user" 
                        ? "bg-gray-100 text-gray-900 rounded-tr-sm font-medium ml-auto w-fit" 
                        : "bg-white border border-gray-100 text-gray-800 rounded-tl-sm"
                    }`}>
                      {msg.content}
                    </div>

                    {/* INTERACTIVE CHOICE CHIPS IN CHAT */}
                    {msg.choices && msg.choices.length > 0 && (
                      <div className="space-y-3 pt-1">
                        {msg.choices.map((choice) => (
                          <div key={choice.itemId} className="bg-gradient-to-r from-purple-50/80 to-indigo-50/60 border border-purple-200/70 p-3.5 rounded-xl space-y-2 shadow-xs">
                            <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                              <Sparkles size={13} className="text-purple-600" />
                              Executive Decision Needed: {choice.question}
                            </span>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {choice.options.map((opt, oIdx) => (
                                <button
                                  key={oIdx}
                                  onClick={() => handleChoiceClick(opt)}
                                  className="bg-white hover:bg-black hover:text-white border border-purple-200 text-purple-900 font-semibold text-xs px-3 py-2 rounded-lg shadow-2xs transition-all active:scale-95 flex items-center gap-1.5"
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isTyping && (
                <div className="flex gap-4 max-w-3xl mr-auto">
                  <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-black">
                    <Bot size={16} className="text-white" />
                  </div>
                  <div className="px-5 py-4 rounded-2xl bg-white border border-gray-100 shadow-sm rounded-tl-sm flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-gray-400" />
                    <span className="text-sm text-gray-400 font-medium">Connecting notes, calculating buffers & preparing clickable chips...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </main>

            <div className="p-4 bg-white border-t border-gray-100 shrink-0">
              <form onSubmit={handleSend} className="max-w-4xl mx-auto relative flex items-center">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Tell me a quick memo, meeting note, or click an option above..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-6 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all text-[15px] placeholder:text-gray-400 font-medium"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isTyping}
                  className="absolute right-2 p-2.5 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:hover:bg-black transition-colors"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </div>

          {/* Right Panel: Executive Diary / 1-Stop Manager / Schedule */}
          <div className="hidden lg:flex w-[460px] bg-[#fafafa] flex-col h-full border-l border-gray-200">
            {/* Tabs Header */}
            <header className="h-16 px-4 flex items-center justify-between border-b border-gray-200/60 shrink-0 bg-white/60 backdrop-blur">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-full text-xs font-medium">
                <button
                  onClick={() => setActiveTab("diary")}
                  className={`flex-1 py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    activeTab === "diary" ? "bg-white text-purple-900 shadow-sm font-bold" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <BookOpen size={14} className="text-purple-600" />
                  Diary Pad
                </button>
                <button
                  onClick={() => setActiveTab("manager")}
                  className={`flex-1 py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    activeTab === "manager" ? "bg-white text-gray-900 shadow-sm font-semibold" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <Zap size={14} className="text-amber-500" />
                  Reminders ({reminders.length})
                </button>
                <button
                  onClick={() => setActiveTab("schedule")}
                  className={`flex-1 py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    activeTab === "schedule" ? "bg-white text-gray-900 shadow-sm font-semibold" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <CalendarDays size={14} />
                  Schedule ({schedule.length})
                </button>
              </div>
            </header>
            
            <div className="flex-1 p-6 overflow-y-auto">
              {/* DIARY TAB (Raw Notes Pad for Officers/CEOs) */}
              {activeTab === "diary" && (
                <div className="bg-white p-6 rounded-2xl border border-purple-200/80 shadow-sm space-y-4 flex flex-col h-[calc(100%-1rem)]">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                        <BookOpen size={18} className="text-purple-600" />
                        Executive Diary Pad
                      </h3>
                      <span className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-full">
                        RAW SNIPPET CAPTURE
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      Jot down any random piece of info (`JAKS Pharma meeting at 3`, `Build Vibe Coding game`, `Home by 9 for laundry`). TaskBuddy turns it into a full schedule!
                    </p>
                  </div>

                  <div className="flex-1 flex flex-col pt-1">
                    <textarea
                      value={diaryContent}
                      onChange={(e) => setDiaryContent(e.target.value)}
                      placeholder="• Type raw snippets, notes, or bullet points here..."
                      className="w-full flex-1 bg-purple-50/30 border border-purple-100 rounded-xl p-4 text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition-all resize-none leading-relaxed"
                    />
                  </div>

                  <button
                    onClick={handleSynthesizeDiary}
                    disabled={isSynthesizing}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md hover:from-purple-800 hover:to-indigo-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isSynthesizing ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Synthesizing Schedule from Diary...
                      </>
                    ) : (
                      <>
                        <Sparkles size={18} />
                        Synthesize Schedule & Options from Diary
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* 1-STOP PERSONAL MANAGER TAB */}
              {activeTab === "manager" && (
                <div className="space-y-6">
                  {/* Proactive Reminders & Alerts Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                        <Bell size={16} className="text-amber-500" />
                        Automated Reminders & Travel Alerts
                      </h3>
                      <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                        {reminders.length} Active
                      </span>
                    </div>

                    {reminders.length === 0 ? (
                      <div className="bg-white p-4 rounded-xl border border-gray-200/80 text-center text-xs text-gray-400 py-6">
                        No active reminders right now.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {reminders.map((rem) => (
                          <div key={rem.id} className={`bg-white p-4 rounded-xl border shadow-sm space-y-2 relative overflow-hidden ${
                            rem.type === "URGENT" ? "border-red-200" : "border-amber-200/80"
                          }`}>
                            <div className={`absolute top-0 left-0 w-1 h-full ${rem.type === "URGENT" ? "bg-red-500" : "bg-amber-500"}`}></div>
                            <div className="flex items-center justify-between text-xs">
                              <span className={`font-bold flex items-center gap-1 ${rem.type === "URGENT" ? "text-red-600" : "text-amber-700"}`}>
                                <ShieldAlert size={13} /> {rem.type} • {rem.time}
                              </span>
                              <button
                                onClick={async () => {
                                  const token = await getToken();
                                  const r = await fetch(`http://localhost:5000/api/reminders/${rem.id}/action`, {
                                    method: "POST", headers: { Authorization: `Bearer ${token}` }
                                  });
                                  if (r.ok) setReminders((await r.json()).activeReminders);
                                }}
                                className="text-gray-400 hover:text-gray-700 font-medium text-[11px] flex items-center gap-1"
                              >
                                <Check size={12} /> Dismiss
                              </button>
                            </div>
                            <h4 className="font-bold text-gray-900 text-sm">{rem.title}</h4>
                            <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-2 rounded-lg border border-gray-100">{rem.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SCHEDULE TAB */}
              {activeTab === "schedule" && (
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
                  {schedule.length === 0 ? (
                    <div className="text-center text-gray-400 mt-12 font-medium">
                      <CalendarDays size={32} className="mx-auto mb-3 text-gray-300 stroke-[1.5]" />
                      No schedule synthesized yet.<br/>Type in your Diary Pad and hit Synthesize!
                    </div>
                  ) : (
                    schedule.map((item, index) => (
                      <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-black shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10 text-white text-xs font-bold">
                          {item.time}
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-gray-100 bg-white shadow-sm text-sm">
                          <div className="font-bold text-gray-900 flex items-center justify-between">
                            {item.title}
                            {item.title.includes("JAKS") && (
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono">CLIENT</span>
                            )}
                            {item.title.includes("Vibe") && (
                              <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-mono">VIBE CODE</span>
                            )}
                          </div>
                          <div className="text-gray-500 mt-1 text-xs leading-relaxed">{item.description}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
