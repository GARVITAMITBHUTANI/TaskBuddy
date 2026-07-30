import json
import os

with open('viewer/graph-data.js', 'r', encoding='utf-8') as f:
    content = f.read()
    json_str = content.replace('const GRAPH = ', '').strip().rstrip(';')
    data = json.loads(json_str)

with open('client/src/graphData.json', 'w', encoding='utf-8') as f:
    json.dump(data, f)
