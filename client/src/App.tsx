import { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';

// Generate a random graph
function generateRandomGraph(numNodes = 100) {
  const nodes = [...Array(numNodes).keys()].map(i => ({
    id: i,
    label: `Node ${i}`,
    group: Math.floor(Math.random() * 5),
    val: Math.random() * 1.5 + 1
  }));
  
  const links = [];
  for (let i = 0; i < numNodes; i++) {
    const target = Math.floor(Math.random() * numNodes);
    if (i !== target) {
      links.push({
        source: i,
        target: target,
      });
    }
  }

  // Add more random links
  for (let i = 0; i < numNodes / 2; i++) {
    links.push({
      source: Math.floor(Math.random() * numNodes),
      target: Math.floor(Math.random() * numNodes),
    });
  }

  return { nodes, links };
}

export default function App() {
  const [data, setData] = useState({ nodes: [], links: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>();

  useEffect(() => {
    setData(generateRandomGraph(150));
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = useCallback((node: any) => {
    // Aim at node from outside it
    const distance = 100;
    const distRatio = 1 + distance/Math.hypot(node.x || 1, node.y || 1, node.z || 1);

    if (graphRef.current) {
      graphRef.current.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new position
        node, // lookAt ({ x, y, z })
        2000  // ms transition duration
      );
    }
  }, [graphRef]);

  // Group colors
  const colors = ['#ff3366', '#00ffcc', '#ffcc00', '#9933ff', '#ffffff'];

  return (
    <div style={{ margin: 0, padding: 0, width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000', position: 'fixed', top: 0, left: 0 }}>
      <ForceGraph3D
        ref={graphRef}
        graphData={data}
        nodeLabel="label"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeColor={(node: any) => colors[node.group % colors.length]}
        nodeRelSize={6}
        onNodeClick={handleClick}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={1.5}
        linkColor={() => 'rgba(255,255,255,0.2)'}
      />
    </div>
  );
}
