import { useState, useRef, useCallback, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { GoogleGenerativeAI } from '@google/generative-ai';
import graphData from './graphData.json';

const groupColors: Record<string, string> = {
  'Strategy': '#ff3366',
  'Finance': '#00ffcc',
  'Operations': '#ffcc00',
  'HR': '#9933ff',
  'Captures': '#33ccff',
  'Root': '#ffffff'
};
const getColor = (group: string) => groupColors[group] || '#cccccc';

function getWords(text: string) {
  return (text.toLowerCase().match(/\w+/g) || []);
}

export default function App() {
  const [data, setData] = useState(graphData);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [highlightNodes, setHighlightNodes] = useState(new Set<any>());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeNote, setActiveNote] = useState<any>(null);
  
  // Voice State
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    let hasGreeted = false;
    const greet = () => {
      if (hasGreeted) return;
      hasGreeted = true;
      const numNotes = graphData.nodes.length;
      speakText(`Good evening, sir. ${numNotes} notes indexed, all systems online.`);
    };

    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
      setTimeout(greet, 1000);
    }
    
    return () => {
       if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    
    const cleanText = text.replace(/\*/g, '').replace(/#/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    
    const jarvisVoice = voices.find(v => v.name.includes('Google UK English Male') || v.name.includes('Daniel') || (v.lang === 'en-GB' && v.name.includes('Male'))) 
                     || voices.find(v => v.lang === 'en-GB');
                     
    if (jarvisVoice) {
      utterance.voice = jarvisVoice;
      utterance.pitch = 0.9; 
      utterance.rate = 1.0;
    }
    window.speechSynthesis.speak(utterance);
  };

  const toggleVoiceActivation = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support voice input. Please use Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true; 
    recognition.interimResults = true; 
    
    recognition.onstart = () => {
      setIsListening(true);
    };
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const lastIndex = event.results.length - 1;
      const transcript = event.results[lastIndex][0].transcript.toLowerCase();
      
      // Update UI with what it hears
      setQuery(transcript);
      
      // Strict Wake Word Logic
      const triggerWords = ['hello jarvis', 'hey jarvis', 'jarvis'];
      const matchedTrigger = triggerWords.find(t => transcript.includes(t));
      
      if (matchedTrigger && !isProcessingRef.current) {
         const command = transcript.split(matchedTrigger)[1].trim();
         // Only proceed if there's an actual command after the wake word!
         if (command && command.length > 3) {
            recognition.stop(); // Stop listening while processing
            submitQuery(command);
         }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') setIsListening(false);
    };

    recognition.onend = () => {
      if (isListening && !isProcessingRef.current) {
         try { recognition.start(); } catch(e) {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeClick = useCallback((node: any) => {
    const distance = 100;
    const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
    if (graphRef.current) {
      graphRef.current.cameraPosition(
        { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 0) * distRatio },
        node,
        2000
      );
    }
  }, [graphRef]);

  const submitQuery = async (textToSubmit: string) => {
    if (!textToSubmit.trim()) return;
    if (isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    setLoading(true);
    setAnswer('');
    
    try {
      if (textToSubmit.toLowerCase().startsWith('remember that')) {
        const res = await fetch('/remember', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textToSubmit, nextId: data.nodes.length })
        });
        const { node } = await res.json();
        
        const queryWords = new Set(getWords(textToSubmit));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let bestNode: any = data.nodes[0];
        let bestScore = -1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.nodes.forEach((n: any) => {
          let score = 0;
          getWords(n.excerpt).forEach(w => { if (queryWords.has(w)) score++; });
          if (score > bestScore) { bestScore = score; bestNode = n; }
        });
        
        setData(prev => ({
          nodes: [...prev.nodes, node],
          links: [...prev.links, { source: node.id, target: bestNode.id }]
        }));
        
        const msg = `Noted, sir. I have saved a new memory: ${node.label}`;
        setAnswer(msg);
        speakText(msg);
        
        setTimeout(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const latestNode = data.nodes.find((n: any) => n.id === node.id) || node;
          setHighlightNodes(new Set([latestNode, bestNode]));
          handleNodeClick(latestNode);
        }, 500);

        setLoading(false);
        isProcessingRef.current = false;
        if (isListening && recognitionRef.current) { try { recognitionRef.current.start(); } catch(e){} }
        return;
      }

      const queryWords = new Set(getWords(textToSubmit));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scores = data.nodes.map((node: any) => {
        let score = 0;
        const labelWords = new Set(getWords(node.label));
        const excerptWords = new Set(getWords(node.excerpt));
        queryWords.forEach(word => {
          if (labelWords.has(word)) score += 5;
          if (excerptWords.has(word)) score += 1;
        });
        return { score, node };
      });
      
      scores.sort((a, b) => b.score - a.score);
      const topNodes = scores.filter(s => s.score > 0).slice(0, 6).map(s => s.node);
      const fallbackNodes = topNodes.length ? topNodes : scores.slice(0, 6).map(s => s.node);

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Please set VITE_GEMINI_API_KEY in client/.env.local");

      const genAI = new GoogleGenerativeAI(apiKey);
      const contextText = fallbackNodes.map(n => `ID: ${n.id}\nTitle: ${n.label}\nExcerpt: ${n.excerpt}`).join('\n\n');

      const prompt = `You are Jarvis, a dry, impeccably polite British AI butler with a razor wit. You address the user as "sir".

USER QUESTION: ${textToSubmit}

LOCAL NOTES:
${contextText}

INSTRUCTIONS:
1. If the answer is in the LOCAL NOTES, answer in ONE witty sentence plus the facts. 
2. If the answer is NOT in the LOCAL NOTES, ignore the notes and answer using your general knowledge directly. Handle small talk and jokes smoothly.
3. You MUST respond with ONLY a raw, valid JSON object exactly like this:
{
  "answer": "Your witty response here",
  "used_note_ids": [array of note IDs you actually used. Leave empty if general knowledge or small talk]
}`;
      
      const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3-flash-preview"];
      let resultText = "";
      let lastErr = null;
      
      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: "application/json" } });
          const result = await model.generateContent(prompt);
          resultText = result.response.text();
          break;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
          lastErr = e;
          if (e.message?.includes('503') || e.message?.includes('404') || e.message?.includes('demand') || e.message?.includes('429') || e.message?.includes('quota')) {
             continue;
          }
          throw e;
        }
      }
      
      if (!resultText) {
          if (lastErr?.message?.includes('429') || lastErr?.message?.includes('quota')) {
               resultText = JSON.stringify({
                  answer: "I apologize, sir, but my neural connections are currently overwhelmed with requests. Please give me about 30 seconds to recalibrate.",
                  used_note_ids: []
               });
          } else {
             throw lastErr || new Error("All Gemini models are currently unavailable.");
          }
      }
      
      const cleanJson = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const responseObj = JSON.parse(cleanJson);
      
      setAnswer(responseObj.answer);
      speakText(responseObj.answer);

      const usedIds = responseObj.used_note_ids || [];
      if (usedIds.length >= 4) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newHighlights = new Set<any>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        usedIds.forEach((id: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const n = data.nodes.find((an: any) => an.id === parseInt(id));
          if (n) newHighlights.add(n);
        });
        setHighlightNodes(newHighlights);
        setActiveNote(null);
      } else if (usedIds.length > 0) {
        const topNodeId = usedIds[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const topNode = data.nodes.find((an: any) => an.id === parseInt(topNodeId));
        if (topNode) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newHighlights = new Set<any>([topNode]);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.links.forEach((l: any) => {
            const sid = l.source.id ?? l.source;
            const tid = l.target.id ?? l.target;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (sid === topNode.id) { const tNode = data.nodes.find((an: any) => an.id === tid); if (tNode) newHighlights.add(tNode); }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (tid === topNode.id) { const sNode = data.nodes.find((an: any) => an.id === sid); if (sNode) newHighlights.add(sNode); }
          });
          setHighlightNodes(newHighlights);
          setActiveNote(topNode);
          handleNodeClick(topNode);
        }
      } else {
        setHighlightNodes(new Set());
        setActiveNote(null);
      }
      
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setAnswer(`Error: ${err.message}`);
      speakText("I encountered an error processing that, sir.");
    }
    
    setLoading(false);
    isProcessingRef.current = false;
    // Resume listening automatically after speaking
    if (isListening && recognitionRef.current) {
       try { recognitionRef.current.start(); } catch(e){}
    }
  };

  return (
    <div style={{ margin: 0, padding: 0, width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#090a0f', position: 'fixed', top: 0, left: 0, fontFamily: 'sans-serif' }}>
      
      {/* 3D Canvas Background */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <ForceGraph3D
          ref={graphRef}
          graphData={data}
          nodeLabel="label"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodeColor={(node: any) => highlightNodes.has(node) ? '#ffffff' : getColor(node.group)}
          nodeRelSize={6}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onNodeClick={(node: any) => { handleNodeClick(node); setActiveNote(node); }}
          linkDirectionalParticles={(link: any) => highlightNodes.has(link.source) || highlightNodes.has(link.target) ? 4 : 0}
          linkDirectionalParticleWidth={2}
          linkColor={() => 'rgba(255,255,255,0.1)'}
          backgroundColor="#090a0f"
        />
      </div>

      {/* LEFT SIDEBAR: Inspector & Hubs */}
      <div style={{ position: 'absolute', top: 20, left: 20, bottom: 20, width: 320, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 20, pointerEvents: 'none' }}>
        
        {/* Header */}
        <div style={{ background: 'rgba(15,15,25,0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 15, backdropFilter: 'blur(10px)', pointerEvents: 'auto' }}>
          <h1 style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1, margin: '0 0 5px 0', color: '#fff' }}>TASKBUDDY OS</h1>
          <div style={{ fontSize: 12, color: '#888' }}>{data.nodes.length} notes • {data.links.length} connections</div>
        </div>

        {/* Search Bar */}
        <div style={{ background: 'rgba(15,15,25,0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '10px 15px', backdropFilter: 'blur(10px)', pointerEvents: 'auto' }}>
          <input placeholder="Search the brain..." style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', outline: 'none', fontSize: 14 }} />
        </div>

        {/* Inspector Panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(15,15,25,0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 20, backdropFilter: 'blur(10px)', pointerEvents: 'auto', overflowY: 'auto' }}>
          <div style={{ fontSize: 11, letterSpacing: 1, color: '#666', fontWeight: 600, marginBottom: 15 }}>INSPECTOR</div>
          {activeNote ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#fff' }}>{activeNote.label}</h3>
                <div style={{ background: getColor(activeNote.group), width: 12, height: 12, borderRadius: '50%', boxShadow: `0 0 10px ${getColor(activeNote.group)}` }} />
              </div>
              <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {activeNote.excerpt}
              </div>
            </div>
          ) : (
            <div style={{ color: '#555', fontSize: 13, lineHeight: 1.6, fontStyle: 'italic' }}>
              Click a node to focus it — only that node and its connections light up, and you can read its contents here.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SIDEBAR: J.A.R.V.I.S Radar & Groups */}
      <div style={{ position: 'absolute', top: 20, right: 20, bottom: 20, width: 280, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 20, pointerEvents: 'none' }}>
        
        {/* Groups List */}
        <div style={{ background: 'rgba(15,15,25,0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 20, backdropFilter: 'blur(10px)', pointerEvents: 'auto' }}>
          <div style={{ fontSize: 11, letterSpacing: 1, color: '#666', fontWeight: 600, marginBottom: 15 }}>DATA GROUPS</div>
          {Object.entries(groupColors).map(([group, color]) => {
            if (group === 'Root') return null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const count = data.nodes.filter((n:any) => n.group === group).length;
            return (
              <div key={group} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', fontSize: 13, color: '#aaa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
                  {group}
                </div>
                <div style={{ color: '#555' }}>{count}</div>
              </div>
            )
          })}
        </div>

        {/* J.A.R.V.I.S. Radar Widget */}
        <div 
          onClick={toggleVoiceActivation}
          style={{ 
            marginTop: 'auto', marginBottom: 50, cursor: 'pointer', display: 'flex', flexDirection: 'column', 
            alignItems: 'center', pointerEvents: 'auto', transition: 'transform 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <div style={{ 
            width: 200, height: 200, borderRadius: '50%', border: '1px solid rgba(0,255,200,0.1)', 
            display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative',
            boxShadow: isListening ? '0 0 40px rgba(0,255,200,0.15)' : 'none',
            background: 'rgba(0,255,200,0.02)', backdropFilter: 'blur(5px)'
          }}>
            {/* Outer dotted ring */}
            <div style={{ 
              position: 'absolute', inset: 10, borderRadius: '50%', border: '2px dashed rgba(0,255,200,0.3)',
              animation: isListening ? 'spin 15s linear infinite' : 'none'
            }}></div>
            
            {/* Inner dashed ring reverse */}
            <div style={{ 
              position: 'absolute', inset: 30, borderRadius: '50%', border: '2px dotted rgba(0,255,200,0.4)',
              animation: isListening ? 'spin 10s linear reverse infinite' : 'none'
            }}></div>

            {/* Center Text */}
            <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '3px', color: '#00ffcc', zIndex: 2 }}>
              J.A.R.V.I.S.
            </div>

            {/* Pulse rings */}
            {isListening && (
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(0,255,200,0.8)', animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite' }}></div>
            )}
            
            <style>{`
              @keyframes spin { 100% { transform: rotate(360deg); } }
              @keyframes ping { 75%, 100% { transform: scale(1.3); opacity: 0; } }
            `}</style>
          </div>
          
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <div style={{ color: isListening ? '#00ffcc' : '#666', fontWeight: 700, letterSpacing: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: isListening ? '#00ffcc' : '#666', boxShadow: isListening ? '0 0 10px #00ffcc' : 'none' }} />
              {isListening ? 'LISTENING' : 'OFFLINE'}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 8, fontStyle: 'italic' }}>
              {isListening ? 'say "Jarvis..."' : 'click radar to wake'}
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM CENTER: Chat UI */}
      <div style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', width: 700, maxWidth: '90vw', zIndex: 20, display: 'flex', flexDirection: 'column', gap: 15 }}>
        
        {/* Hovering Answer Box */}
        {answer && (
          <div style={{
            background: 'rgba(10, 12, 18, 0.85)', border: '1px solid rgba(0, 255, 200, 0.2)',
            backdropFilter: 'blur(15px)', borderRadius: 16, padding: '20px 25px',
            color: '#e0e0e0', lineHeight: 1.6, fontSize: 15, boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            {answer}
          </div>
        )}
        
        {/* Sleek Input Bar */}
        <form onSubmit={(e) => { e.preventDefault(); submitQuery(query); }} style={{
          display: 'flex', alignItems: 'center', gap: 15, background: 'rgba(15, 15, 25, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(20px)',
          borderRadius: 30, padding: '8px 20px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
        }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Ask - "remind me..." - "good morning" - "show me..."'
            disabled={loading}
            style={{
              flex: 1, background: 'transparent', border: 'none', color: '#fff',
              fontSize: 15, outline: 'none'
            }}
          />
          
          {loading && (
             <div style={{ color: '#00ffcc', fontSize: 12, letterSpacing: 1, animation: 'pulse 1.5s infinite' }}>THINKING...</div>
          )}
          
          {/* Action Icons */}
          <div style={{ display: 'flex', gap: 15, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 15 }}>
            <button type="button" style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}>🖥️</button>
            <button type="button" style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}>🔔</button>
            <button type="button" style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}>💡</button>
            <button type="button" style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}>📂</button>
          </div>
        </form>
      </div>
    </div>
  );
}
