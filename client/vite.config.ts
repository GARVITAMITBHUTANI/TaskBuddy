import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    {
      name: 'remember-endpoint',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/remember' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
              const { text, nextId } = JSON.parse(body);
              const capturesDir = path.resolve(__dirname, '../../notes/captures');
              if (!fs.existsSync(capturesDir)) {
                fs.mkdirSync(capturesDir, { recursive: true });
              }
              const cleanText = text.replace(/^remember that\s+/i, '');
              const words = cleanText.split(' ').slice(0, 4);
              const title = words.join('_').replace(/[^a-zA-Z0-9_]/g, '') || `Note_${Date.now()}`;
              const filepath = path.join(capturesDir, `${title}.md`);
              
              fs.writeFileSync(filepath, `# ${title}\n\n${cleanText}`);
              
              const newNode = {
                id: nextId,
                label: title.replace(/_/g, ' '),
                group: 'Captures',
                excerpt: cleanText.substring(0, 700)
              };
              
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ node: newNode }));
            });
          } else {
            next();
          }
        });
      }
    }
  ],
  server: {
    host: true, // Exposes the server so you can view it even with port forwarding
  }
})
