import csv
import json
import os

input_file = r'd:\Desktop\AG -Projetos\Lineage_Graph_Edges.csv'
output_file = r'd:\Desktop\AG -Projetos\lineage_data.json'
stats_file = r'd:\Desktop\AG -Projetos\Contadores_Script.csv'

def process_csv():
    nodes = {}
    edges = {}
    apps = set()
    op_types = set()
    app_stats = {}

    print(f"Reading {stats_file}...")
    try:
        with open(stats_file, mode='r', encoding='utf-8-sig') as sf:
            s_reader = csv.DictReader(sf, delimiter=';')
            for row in s_reader:
                app = row.get('app_id', '').strip()
                if app:
                    app_stats[app] = {k: int(v) if str(v).isdigit() else v for k, v in row.items() if k != 'app_id'}
    except Exception as e:
        print(f"Error reading {stats_file}: {e}")

    print(f"Reading {input_file}...")
    
    # Try reading with utf-8-sig, then latin-1 if it fails
    reader = None
    file_handle = None
    try:
        file_handle = open(input_file, mode='r', encoding='utf-8-sig')
        reader = csv.DictReader(file_handle, delimiter=';')
        # Check first row to see if it's actually reading correctly
        first_row = next(reader)
        # Reset file pointer for full processing
        file_handle.seek(0)
        reader = csv.DictReader(file_handle, delimiter=';')
    except Exception as e:
        print(f"Switching to latin-1 due to: {e}")
        if file_handle: file_handle.close()
        file_handle = open(input_file, mode='r', encoding='latin-1')
        reader = csv.DictReader(file_handle, delimiter=';')

    for row in reader:
        source = row.get('Origem', '').strip()
        target = row.get('Destino', '').strip()
        s_phys = row.get('Origem_Fisica', '').strip()
        t_phys = row.get('Destino_Fisico', '').strip()
        app = row.get('Aplicativo', '').strip()
        op_type = row.get('Tipo_Operação', '').strip()
        
        if not source or not target:
            continue

        apps.add(app)
        op_types.add(op_type)

        # Track unique nodes and their physical paths
        if source not in nodes:
            nodes[source] = {'id': source, 'type': 'source', 'physical_paths': set()}
        if s_phys: nodes[source]['physical_paths'].add(s_phys)

        if target not in nodes:
            nodes[target] = {'id': target, 'type': 'target', 'physical_paths': set()}
        if t_phys: nodes[target]['physical_paths'].add(t_phys)

        # Unique key for edge
        edge_key = (source, target)
        if edge_key not in edges:
            edges[edge_key] = {
                'source': source,
                'target': target,
                'weight': 0,
                'apps': set(),
                'types': set(),
                'paths': set()
            }
        
        edges[edge_key]['weight'] += 1
        edges[edge_key]['apps'].add(app)
        edges[edge_key]['types'].add(op_type)
        if s_phys: edges[edge_key]['paths'].add(s_phys)
        if t_phys: edges[edge_key]['paths'].add(t_phys)

    file_handle.close()

    # Convert sets to lists for JSON serialization
    formatted_nodes = []
    for node in nodes.values():
        node['physical_paths'] = sorted(list(node['physical_paths']))
        formatted_nodes.append(node)

    formatted_edges = []
    for edge in edges.values():
        edge['apps'] = sorted(list(edge['apps']))
        edge['types'] = sorted(list(edge['types']))
        edge['paths'] = sorted(list(edge['paths']))
        formatted_edges.append(edge)

    data = {
        'nodes': formatted_nodes,
        'links': formatted_edges,
        'filters': {
            'apps': sorted(list(apps)),
            'types': sorted(list(op_types))
        },
        'app_stats': app_stats
    }

    print(f"Writing {output_file}...")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("Done!")

if __name__ == "__main__":
    process_csv()
