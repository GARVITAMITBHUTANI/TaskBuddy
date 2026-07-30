import os
import json
import re

NOTES_DIR = "notes"
VIEWER_DIR = "viewer"

def build_graph():
    nodes = []
    links = []
    node_index_map = {} # filename without ext -> index
    
    # First pass: create nodes
    idx = 0
    for root, dirs, files in os.walk(NOTES_DIR):
        for file in files:
            if file.endswith(".md"):
                filepath = os.path.join(root, file)
                group = os.path.basename(root)
                if group == "notes":
                    group = "Root"
                label = file[:-3] # remove .md
                
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                
                excerpt = content[:700]
                
                nodes.append({
                    "id": idx,
                    "label": label,
                    "group": group,
                    "excerpt": excerpt,
                    "filepath": filepath
                })
                node_index_map[label] = idx
                idx += 1
                
    # Second pass: create links
    for node in nodes:
        content = node["excerpt"]
        
        # Look for [[wikilinks]]
        wikilinks = re.findall(r"\[\[(.*?)\]\]", content)
        for link_target in wikilinks:
            if link_target in node_index_map:
                target_id = node_index_map[link_target]
                if node["id"] != target_id:
                    links.append({
                        "source": node["id"],
                        "target": target_id
                    })
                    
        # Look for mentions of other node labels
        for target_label, target_id in node_index_map.items():
            if target_label != node["label"]:
                # Simple text mention (case insensitive but exact phrase)
                if re.search(r'\b' + re.escape(target_label) + r'\b', content, re.IGNORECASE):
                    # add link if not already added
                    if not any(l["source"] == node["id"] and l["target"] == target_id for l in links):
                        links.append({
                            "source": node["id"],
                            "target": target_id
                        })

    graph_data = {
        "nodes": nodes,
        "links": links
    }
    
    os.makedirs(VIEWER_DIR, exist_ok=True)
    with open(os.path.join(VIEWER_DIR, "graph-data.js"), "w", encoding="utf-8") as f:
        f.write(f"const GRAPH = {json.dumps(graph_data)};")
        
    print(f"Built graph with {len(nodes)} nodes and {len(links)} links.")

if __name__ == "__main__":
    build_graph()
