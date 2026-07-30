import { useState, useRef, useCallback, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { GoogleGenerativeAI } from '@google/generative-ai';
import graphData from './graphData.json';

// Group colors
const groupColors: Record<string, string> = {
  'Strategy': '#ff3366',
  'Finance': '#00ffcc',
  'Operations': '#ffcc00',
  'HR': '#9933ff',
  'Root': '#ffffff'
};
const getColor = (group: string) => groupColors[group] || '#cccccc';

// Basic word extraction for simple scoring
function getWords(text: string) {
  return (text.toLowerCase().match(/\w+/g) || []);
}

export default function App() {
  const [data] = useState(graphData);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState(''); // '● listening…', '● thinking…'
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [highlightNodes, setHighlightNodes] = useState(new Set<any>());

  // Pre-load voices for Speech Synthesis
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    
    window.speechSynthesis.cancel(); // Stop any current speech
    
    // Strip markdown bold/asterisks for cleaner reading
    const cleanText = text.replace(/\*/g, '').replace(/#/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Try to find a British voice
    const voices = window.speechSynthesis.getVoices();
    const britishVoice = voices.find(v => v.lang.includes('en-GB') || v.name.includes('UK'));
    if (britishVoice) {
      utterance.voice = britishVoice;
    }
    
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support voice input. Please use Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    
    recognition.onstart = () => {
      setStatus('● listening…');
    };
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      // Auto-submit the voice query
      submitQuery(transcript);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setStatus('');
    };

    recognition.onend = () => {
      // Only clear if it's still stuck on listening (success moves to thinking)
      setStatus((prev) => prev === '● listening…' ? '' : prev);
    };

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

    setLoading(true);
    setStatus('● thinking…');
    setAnswer('');
    
    try {
      // 1. Score nodes
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

      // Highlight in 3D
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newHighlightNodes = new Set<any>();
      fallbackNodes.forEach(n => {
        // Find the node directly from our state array
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const actualNode = data.nodes.find((an: any) => an.id === n.id);
        if (actualNode) newHighlightNodes.add(actualNode);
      });
      setHighlightNodes(newHighlightNodes);

      if (newHighlightNodes.size > 0) {
        const first = Array.from(newHighlightNodes)[0];
        handleNodeClick(first);
      }

      // 2. Call Gemini
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        const errMsg = "Please set VITE_GEMINI_API_KEY in client/.env.local and restart Vite.";
        setAnswer(errMsg);
        speakText(errMsg);
        setLoading(false);
        setStatus('');
        return;
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const contextText = fallbackNodes.map(n => `Title: ${n.label}\nExcerpt: ${n.excerpt}`).join('\n\n');
      
      // Update prompt to allow fallback to general knowledge
      const prompt = `First try to answer using ONLY the provided notes. If the notes do NOT contain the answer, you may answer the question using your general internet knowledge base. Keep the answer to 2-3 sentences max.\n\nNOTES:\n${contextText}\n\nUSER QUESTION: ${textToSubmit}`;
      
      const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3-flash-preview"];
      let resultText = "";
      let lastErr = null;
      
      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          resultText = result.response.text();
          break;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
          lastErr = e;
          if (e.message?.includes('503') || e.message?.includes('404') || e.message?.includes('demand')) {
             console.warn(`Model ${modelName} unavailable, trying next...`);
             continue;
          }
          throw e;
        }
      }
      
      if (!resultText) {
        throw lastErr || new Error("All Gemini models are currently unavailable.");
      }
      
      setAnswer(resultText);
      speakText(resultText);
      
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const errMsg = `Error: ${err.message}`;
      setAnswer(errMsg);
      speakText(errMsg);
    }
    setLoading(false);
    setStatus('');
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
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
        onNodeClick={handleNodeClick}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={1.5}
        linkColor={() => 'rgba(255,255,255,0.2)'}
      />

      {/* Chat UI overlay */}
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
            placeholder="Ask your knowledge galaxy..."
            autoComplete="off"
            style={{
              flex: 1, background: 'transparent', border: 'none', color: '#fff',
              padding: '10px 20px', fontSize: '16px', outline: 'none'
            }}
          />
          
          <button 
            type="button" 
            onClick={startListening} 
            disabled={loading}
            style={{
              background: 'transparent', color: status === '● listening…' ? '#ff3366' : '#fff',
              border: 'none', fontSize: '20px', cursor: loading ? 'not-allowed' : 'pointer',
              padding: '0 10px', transition: 'color 0.2s'
            }} 
            title="Speak"
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
