import http.server
import socketserver
import json
import urllib.request
import urllib.error
import re
from collections import defaultdict
import os

PORT = 4700
DIRECTORY = "viewer"

sessions = defaultdict(list)

def load_config():
    try:
        with open('config.json', 'r') as f:
            return json.load(f)
    except Exception:
        return {"api_key": "PUT-YOUR-KEY-HERE", "model": "claude-opus-4-8"}

def load_graph_nodes():
    try:
        with open(os.path.join(DIRECTORY, 'graph-data.js'), 'r', encoding='utf-8') as f:
            content = f.read()
            json_str = content.replace('const GRAPH = ', '').strip().rstrip(';')
            graph_data = json.loads(json_str)
            return graph_data.get('nodes', [])
    except Exception as e:
        print(f"Error loading graph data: {e}")
        return []

def score_notes(query, nodes):
    query_words = set(re.findall(r'\w+', query.lower()))
    scores = []
    
    for node in nodes:
        score = 0
        label_words = set(re.findall(r'\w+', node['label'].lower()))
        excerpt_words = set(re.findall(r'\w+', node['excerpt'].lower()))
        
        for word in query_words:
            if word in label_words:
                score += 5
            if word in excerpt_words:
                score += 1
                
        scores.append((score, node))
        
    scores.sort(key=lambda x: x[0], reverse=True)
    # Take top 6 that have at least some score, or just top 6
    return [node for score, node in scores[:6] if score > 0] or [node for score, node in scores[:6]]

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_POST(self):
        if self.path == '/chat':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                req_json = json.loads(post_data.decode('utf-8'))
                query = req_json.get('query', '')
                session_id = req_json.get('session_id', 'default')
                
                config = load_config()
                api_key = config.get('api_key')
                model = config.get('model', 'claude-opus-4-8')
                
                if api_key == "PUT-YOUR-KEY-HERE" or not api_key:
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    response = {
                        "answer": "Please paste your Anthropic API key into config.json first.",
                        "nodes": []
                    }
                    self.wfile.write(json.dumps(response).encode('utf-8'))
                    return
                
                nodes = load_graph_nodes()
                top_nodes = score_notes(query, nodes)
                used_ids = [n['id'] for n in top_nodes]
                
                context_text = "\n\n".join([f"Title: {n['label']}\nExcerpt: {n['excerpt']}" for n in top_nodes])
                
                system_prompt = (
                    "Answer ONLY from these notes, in 2-3 sentences. "
                    "Admit it when the notes don't cover it.\n\n"
                    f"NOTES:\n{context_text}"
                )
                
                history = sessions[session_id]
                messages = history + [{"role": "user", "content": query}]
                
                data = {
                    "model": model,
                    "max_tokens": 150,
                    "system": system_prompt,
                    "messages": messages
                }
                
                req = urllib.request.Request(
                    'https://api.anthropic.com/v1/messages',
                    data=json.dumps(data).encode('utf-8'),
                    headers={
                        'x-api-key': api_key,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json'
                    },
                    method='POST'
                )
                
                try:
                    with urllib.request.urlopen(req) as f:
                        res_data = json.loads(f.read().decode('utf-8'))
                        
                    answer = res_data['content'][0]['text']
                    
                    sessions[session_id].append({"role": "user", "content": query})
                    sessions[session_id].append({"role": "assistant", "content": answer})
                    sessions[session_id] = sessions[session_id][-6:]
                    
                except urllib.error.URLError as e:
                    if hasattr(e, 'read'):
                        err_msg = e.read().decode('utf-8')
                        answer = f"API Error: {e.code} - {err_msg}"
                    else:
                        answer = f"API Error: {str(e)}"
                        
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                
                response = {
                    "answer": answer,
                    "nodes": used_ids
                }
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving {DIRECTORY} at http://localhost:{PORT}")
        httpd.serve_forever()
