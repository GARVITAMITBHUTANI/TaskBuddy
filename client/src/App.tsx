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
  const [status, setStatus] = useState(''); 
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [highlightNodes, setHighlightNodes] = useState(new Set<any>());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeNote, setActiveNote] = useState<any>(null);
  
  // Voice Activation State
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
      speakText(`Good evening, sir. ${numNotes} notes indexed, all present and accounted for.`);
    };

    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
      setTimeout(greet, 1000);
    }
    
    // Cleanup recognition on unmount
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
    const britishVoice = voices.find(v => v.lang.includes('en-GB') || v.name.includes('UK'));
    if (britishVoice) utterance.voice = britishVoice;
    
    window.speechSynthesis.speak(utterance);
  };

  const toggleVoiceActivation = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      setStatus('');
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
    recognition.continuous = true; // Listen continuously for wake word
    recognition.interimResults = false;
    
    recognition.onstart = () => {
      setIsListening(true);
      setStatus('Waiting for "Hello Jarvis"...');
    };
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const lastIndex = event.results.length - 1;
      const transcript = event.results[lastIndex][0].transcript.toLowerCase();
      setQuery(transcript);
      
      // Wake Word Detection
      if (transcript.includes('hello jarvis') || transcript.includes('hey jarvis') || transcript.includes('jarvis')) {
         const triggerWords = ['hello jarvis', 'hey jarvis', 'jarvis'];
         let command = transcript;
         for (const trigger of triggerWords) {
            if (command.includes(trigger)) {
               command = command.split(trigger)[1].trim();
               break;
            }
         }
         
         if (command) {
            submitQuery(command);
         } else {
            speakText("Yes, sir? I am listening.");
            setStatus('● listening…');
         }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setIsListening(false);
        setStatus('');
      }
    };

    recognition.onend = () => {
      // Auto-restart if it closes and we still want it listening
      if (isListening) {
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
    
    // Prevent double-submissions from rapid voice results hitting 429
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    setLoading(true);
    setStatus('● thinking…');
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
        
        const newLink = { source: node.id, target: bestNode.id };
        
        setData(prev => ({
          nodes: [...prev.nodes, node],
          links: [...prev.links, newLink]
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
        setStatus(isListening ? 'Waiting for "Hello Jarvis"...' : '');
        isProcessingRef.current = false;
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
             console.warn(`Model ${modelName} unavailable, trying next...`);
             continue;
          }
          throw e;
        }
      }
      
      if (!resultText) throw lastErr || new Error("All Gemini models are currently unavailable.");
      
      // Clean JSON in case Gemini wrapped it in markdown code blocks
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
      const errMsg = `Error: ${err.message}`;
      setAnswer(errMsg);
      speakText("I encountered an error processing that, sir.");
    }
    
    setLoading(false);
    setStatus(isListening ? 'Waiting for "Hello Jarvis"...' : '');
    isProcessingRef.current = false;
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuery(query);
  };

  return (
    <div style={{ margin: 0, padding: 0, width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000', position: 'fixed', top: 0, left: 0 }}>
      <ForceGraph3D
        ref={graphRef}
        graphData={data}
        nodeLabel="label"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeColor={(node: any) => highlightNodes.has(node) ? 'rgb(255,0,0,1)' : getColor(node.group)}
        nodeRelSize={6}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onNodeClick={(node: any) => { handleNodeClick(node); setActiveNote(node); }}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={1.5}
        linkColor={() => 'rgba(255,255,255,0.2)'}
      />

      {activeNote && (
        <div style={{
          position: 'absolute', top: 0, right: 0, width: '350px', height: '100vh',
          background: 'rgba(15, 15, 25, 0.9)', padding: '30px', color: '#fff',
          borderLeft: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)',
          boxSizing: 'border-box', overflowY: 'auto', zIndex: 10
        }}>
          <span onClick={() => setActiveNote(null)} style={{ cursor: 'pointer', float: 'right', fontSize: '24px', color: '#aaa' }}>&times;</span>
          <h2 style={{ marginTop: 0, fontWeight: 300, borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '10px' }}>
            {activeNote.label}
          </h2>
          <div style={{
            background: getColor(activeNote.group), padding: '4px 8px', borderRadius: '12px',
            display: 'inline-block', color: '#000', marginBottom: '20px', fontSize: '12px', fontWeight: 'bold'
          }}>
            {activeNote.group}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', color: '#ccc', lineHeight: '1.6' }}>
            {activeNote.excerpt}
          </div>
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
        width: '600px', maxWidth: '90vw', zIndex: 20, display: 'flex', flexDirection: 'column', gap: '10px'
      }}>
        {status && (
          <div style={{ color: '#00ffcc', fontSize: '14px', fontStyle: 'italic', paddingLeft: '20px', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
            {status}
          </div>
        )}
        
        {answer && (
          <div style={{
            background: 'rgba(15, 15, 25, 0.9)', border: '1px solid rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)', borderRadius: '12px', padding: '15px 20px',
            color: '#fff', lineHeight: '1.5'
          }}>
            {answer}
          </div>
        )}
        
        <form onSubmit={handleChatSubmit} style={{
          display: 'flex', gap: '10px', background: 'rgba(15, 15, 25, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(10px)',
          borderRadius: '30px', padding: '5px'
        }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Ask or say "Hello Jarvis..."'
            autoComplete="off"
            style={{
              flex: 1, background: 'transparent', border: 'none', color: '#fff',
              padding: '10px 20px', fontSize: '16px', outline: 'none'
            }}
          />
          
          <button 
            type="button" 
            onClick={toggleVoiceActivation} 
            disabled={loading}
            style={{
              background: 'transparent', color: isListening ? '#ff3366' : '#fff',
              border: 'none', fontSize: '20px', cursor: loading ? 'not-allowed' : 'pointer',
              padding: '0 10px', transition: 'color 0.2s',
              textShadow: isListening ? '0 0 10px #ff3366' : 'none'
            }} 
            title={isListening ? "Disable Wake Word" : "Enable Wake Word"}
          >
            🎙
          </button>
          
          <button type="submit" disabled={loading} style={{
            background: '#fff', color: '#000', border: 'none', borderRadius: '25px',
            padding: '0 20px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer'
          }}>
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
