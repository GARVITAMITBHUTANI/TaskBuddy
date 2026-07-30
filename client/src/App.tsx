import { useState, useRef, useCallback } from 'react';
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
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [highlightNodes, setHighlightNodes] = useState(new Set<any>());

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

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setAnswer('Thinking...');
    
    try {
      // 1. Score nodes
      const queryWords = new Set(getWords(query));
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const actualNode = graphRef.current.graphData().nodes.find((an: any) => an.id === n.id);
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
        setAnswer("Please set VITE_GEMINI_API_KEY in client/.env.local and restart Vite.");
        setLoading(false);
        return;
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const contextText = fallbackNodes.map(n => `Title: ${n.label}\nExcerpt: ${n.excerpt}`).join('\n\n');
      
      const prompt = `Answer ONLY from these notes, in 2-3 sentences. Admit it when the notes don't cover it.\n\nNOTES:\n${contextText}\n\nUSER QUESTION: ${query}`;
      
      const result = await model.generateContent(prompt);
      setAnswer(result.response.text());
      
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setAnswer(`Error: ${err.message}`);
    }
    setLoading(false);
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
