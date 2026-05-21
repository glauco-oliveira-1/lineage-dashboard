let fullData = null;
let filteredData = null;
let simulation = null;
let svg = null;
let g = null;
let zoom = null;

const width = window.innerWidth - 350;
const height = window.innerHeight;

// Initialize the SVG and zoom behavior
function init() {
    svg = d3.select("#lineage-graph")
        .attr("width", width)
        .attr("height", height);

    g = svg.append("g");

    zoom = d3.zoom()
        .scaleExtent([0.05, 8])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
            
            // Semantic zoom: hide text if zoom is too small
            if (event.transform.k < 0.6) {
                svg.classed("macro-view", true);
            } else {
                svg.classed("macro-view", false);
            }
        });

    svg.call(zoom);

    svg.on("click", (event) => {
        if (event.target.tagName === 'svg') {
            clearDetails();
        }
    });

    d3.select("#reset-zoom").on("click", () => {
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
        clearDetails();
    });

    loadData();
}

async function loadData() {
    if (window.location.protocol === 'file:') {
        document.getElementById('details-content').innerHTML = `
            <div class="error-box">
                <p><strong>CORS Error:</strong> Browser security blocks loading data from <code>file://</code>.</p>
                <p>You MUST run a local server to view this. Run this command in your terminal:</p>
                <code>python -m http.server 8000</code>
                <p>Then access: <a href="http://localhost:8000" target="_blank">http://localhost:8000</a></p>
            </div>
        `;
        return;
    }

    try {
        const response = await fetch('lineage_data.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        fullData = await response.json();
        
        populateFilters();
        updateGraph();
        
        // Setup search
        d3.select("#search-node").on("input", function() {
            const term = this.value.toLowerCase();
            if (term.length < 3) return;
            
            const match = fullData.nodes.find(n => n.id.toLowerCase().includes(term));
            if (match) {
                focusNode(match.id);
            }
        });

        d3.select("#app-filter").on("change", updateGraph);
        d3.select("#type-filter").on("change", updateGraph);

    } catch (error) {
        console.error("Error loading data:", error);
        document.getElementById('details-content').innerHTML = `<p class="error">Error loading data. Make sure lineage_data.json exists.</p>`;
    }
}

function populateFilters() {
    const appFilter = d3.select("#app-filter");
    fullData.filters.apps.forEach(app => {
        appFilter.append("option").attr("value", app).text(app);
    });

    const typeFilter = d3.select("#type-filter");
    fullData.filters.types.forEach(type => {
        typeFilter.append("option").attr("value", type).text(type);
    });
}

function updateGraph() {
    const selectedApp = d3.select("#app-filter").property("value");
    const selectedType = d3.select("#type-filter").property("value");

    if (selectedApp !== "all") {
        showAppStats(selectedApp);
    } else {
        clearDetails();
    }

    // Filter links
    let links = fullData.links.filter(l => {
        const appMatch = selectedApp === "all" || l.apps.includes(selectedApp);
        const typeMatch = selectedType === "all" || l.types.includes(selectedType);
        return appMatch && typeMatch;
    });

    // If too many links, limit for performance (can be adjusted)
    const MAX_LINKS = 2000;
    if (links.length > MAX_LINKS) {
        console.warn(`Too many links (${links.length}). Limiting to ${MAX_LINKS} for performance.`);
        links = links.sort((a, b) => b.weight - a.weight).slice(0, MAX_LINKS);
    }

    // Get nodes involved in filtered links
    const nodeIds = new Set();
    links.forEach(l => {
        nodeIds.add(l.source);
        nodeIds.add(l.target);
    });

    const nodes = fullData.nodes.filter(n => nodeIds.has(n.id));

    render(nodes, links);
}

function render(nodes, links) {
    if (simulation) simulation.stop();

    g.selectAll("*").remove();

    // Arrow markers
    const defs = g.append("defs");
    defs.append("marker")
        .attr("id", "arrowhead")
        .attr("viewBox", "-0 -5 10 10")
        .attr("refX", 20)
        .attr("refY", 0)
        .attr("orient", "auto")
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("xoverflow", "visible")
        .append("svg:path")
        .attr("d", "M 0,-5 L 10 ,0 L 0,5")
        .attr("fill", "#94a3b8")
        .style("stroke", "none");

    defs.append("marker")
        .attr("id", "arrowhead-in")
        .attr("viewBox", "-0 -5 10 10")
        .attr("refX", 20)
        .attr("refY", 0)
        .attr("orient", "auto")
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("xoverflow", "visible")
        .append("svg:path")
        .attr("d", "M 0,-5 L 10 ,0 L 0,5")
                .attr("fill", "#4caf50")
        .style("stroke", "none");
    // Outgoing arrow marker (orange)
    defs.append("marker")
        .attr("id", "arrowhead-out")
        .attr("viewBox", "-0 -5 10 10")
        .attr("refX", 20)
        .attr("refY", 0)
        .attr("orient", "auto")
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("xoverflow", "visible")
        .append("svg:path")
        .attr("d", "M 0,-5 L 10 ,0 L 0,5")
        .attr("fill", "#ff9800")
        .style("stroke", "none");

    defs.append("marker")
        .attr("id", "arrowhead-out")
        .attr("viewBox", "-0 -5 10 10")
        .attr("refX", 20)
        .attr("refY", 0)
        .attr("orient", "auto")
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("xoverflow", "visible")
        .append("svg:path")
        .attr("d", "M 0,-5 L 10 ,0 L 0,5")
        .attr("fill", "#ff9800")
        .style("stroke", "none");

    simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(150))
        .force("charge", d3.forceManyBody().strength(-400))
        .force("collide", d3.forceCollide().radius(d => 10 + Math.sqrt(getNodeWeight(d.id, links)) * 3).iterations(2))
        .force("x", d3.forceX(d => {
            // Push sources left, targets right
            if (d.type === 'source') return width * 0.2;
            if (d.type === 'target') return width * 0.8;
            return width / 2;
        }).strength(0.3))
        .force("y", d3.forceY(height / 2).strength(0.1));

    const link = g.append("g")
        .attr("class", "links")
        .selectAll("path")
        .data(links)
        .enter().append("path")
        .attr("class", "link")
        .attr("marker-end", "url(#arrowhead)");

    // Compute parallel link offsets
    const linkCounts = {};
    links.forEach(l => {
        const key = `${l.source.id}-${l.target.id}`;
        linkCounts[key] = (linkCounts[key] || 0) + 1;
    });
    const linkOffsets = {};
    links.forEach(l => {
        const key = `${l.source.id}-${l.target.id}`;
        const total = linkCounts[key];
        const idx = linkOffsets[key] ? linkOffsets[key] + 1 : 0;
        linkOffsets[key] = idx;
        l._parallelIndex = idx;
        l._parallelTotal = total;
    });

    const node = g.append("g")
        .attr("class", "nodes")
        .selectAll("g")
        .data(nodes)
        .enter().append("g")
        .attr("class", "node")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended))
        .on("click", (event, d) => showDetails(d));

    node.append("circle")
        .attr("r", d => 5 + Math.sqrt(getNodeWeight(d.id, links)) * 2)
        .attr("fill", d => d.type === 'source' ? 'var(--node-source)' : 'var(--node-target)');

    node.append("text")
        .attr("dx", 12)
        .attr("dy", ".35em")
        .text(d => {
            const parts = d.id.split('\\');
            return parts[parts.length - 1];
        });

    simulation.on("tick", () => {
        link.attr("d", d => {
            const x1 = d.source.x, y1 = d.source.y;
            const x2 = d.target.x, y2 = d.target.y;
            const dx = x2 - x1, dy = y2 - y1;
            const dr = Math.sqrt(dx * dx + dy * dy);
            // offset perpendicular to line for parallel links
            const offset = (d._parallelTotal > 1) ? (d._parallelIndex - (d._parallelTotal - 1) / 2) * 10 : 0;
            const mx = (x1 + x2) / 2 + -dy / dr * offset;
            const my = (y1 + y2) / 2 + dx / dr * offset;
            return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
        });

        node
            .attr("transform", d => `translate(${d.x},${d.y})`);
    });
}

function getNodeWeight(nodeId, links) {
    return links.filter(l => l.source.id === nodeId || l.target.id === nodeId || l.source === nodeId || l.target === nodeId).length;
}

function showDetails(node) {
    const detailsContent = document.getElementById('details-content');
    
    // Highlight related
    d3.selectAll(".link")
        .classed("dimmed", true)
        .classed("highlight", false)
        .classed("highlight-in", false)
        .classed("highlight-out", false)
        .attr("marker-end", "url(#arrowhead)");
    
    d3.selectAll(".node").classed("dimmed", true).classed("highlight", false);

    d3.selectAll(".link").each(function(l) {
        if (l.target.id === node.id || l.target === node.id) {
            d3.select(this)
                .classed("highlight-in", true)
                .classed("dimmed", false)
                .attr("marker-end", "url(#arrowhead-in)");
        } else if (l.source.id === node.id || l.source === node.id) {
            d3.select(this)
                .classed("highlight-out", true)
                .classed("dimmed", false)
                .attr("marker-end", "url(#arrowhead-out)");
        }
    });

    // Gather all links involving this node (handle object or id forms)
    const relatedLinks = fullData.links.filter(l =>
        (typeof l.source === 'object' ? l.source.id : l.source) === node.id ||
        (typeof l.target === 'object' ? l.target.id : l.target) === node.id);
    const neighbors = new Set([node.id]);
    relatedLinks.forEach(l => {
        neighbors.add(typeof l.source === 'object' ? l.source.id : l.source);
        neighbors.add(typeof l.target === 'object' ? l.target.id : l.target);
    });

    // Highlight related links with direction-specific styles
    d3.selectAll(".link")
        .classed("dimmed", true)
        .classed("highlight", false)
        .classed("highlight-in", false)
        .classed("highlight-out", false);

    // Apply highlight based on direction
    relatedLinks.forEach(l => {
        const isOut = l.source.id === node.id || l.source === node.id;
        d3.selectAll(".link")
            .filter(d => d === l)
            .classed(isOut ? "highlight-out" : "highlight-in", true)
            .classed("dimmed", false)
            .attr("marker-end", isOut ? "url(#arrowhead-out)" : "url(#arrowhead-in)");
    });

    d3.selectAll(".node")
        .filter(n => neighbors.has(n.id))
        .classed("highlight", true)
        .classed("dimmed", false);

    
    // Build details panel with inbound/outbound sections
    const inbound = [];
    const outbound = [];
    relatedLinks.forEach(l => {
        const isOut = (typeof l.source === 'object' ? l.source.id : l.source) === node.id;
        if (isOut) {
            outbound.push(l);
        } else {
            inbound.push(l);
        }
    });

    let html = `
        <div class="detail-item">
            <strong>Nome Lógico:</strong>
            <span class="value">${node.id}</span>
        </div>
        <div class="detail-item">
            <strong>Interações:</strong>
            <span class="value">${relatedLinks.length}</span>
        </div>
        <div class="detail-item">
            <strong>Origem (Incoming):</strong>
            <ul class="path-list">${inbound.map(l => {
                const srcId = typeof l.source === 'object' ? l.source.id : l.source;
                return `<li>${srcId}</li>`;
            }).join('')}</ul>
        </div>
        <div class="detail-item">
            <strong>Destino (Outgoing):</strong>
            <ul class="path-list">${outbound.map(l => {
                const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
                return `<li>${tgtId}</li>`;
            }).join('')}</ul>
        </div>
    `;

    // Preserve existing physical paths section unchanged
    if (node.physical_paths && node.physical_paths.length > 0) {
        html += `
            <div class="relations">
                <h4>Trilha Física (Caminhos Reais):</h4>
                <ul class="path-list">
                    ${node.physical_paths.map(p => `<li>${p}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    html += `
        <div class="relations">
            <h4>Conectado com:</h4>
            <ul>
    `;

    relatedLinks.slice(0, 10).forEach(l => {
        const otherId = typeof l.source === 'object' ? (l.source.id === node.id ? l.target.id : l.source.id) : (l.source === node.id ? l.target : l.source);
        html += `<li>${otherId} (${l.weight}x)</li>`;
    });

    if (relatedLinks.length > 10) {
        html += `<li>...e mais ${relatedLinks.length - 10} conexões</li>`;
    }

    html += `</ul></div>`;

    // Extract apps involved with this node
    let appsInvolved = new Set();
    relatedLinks.forEach(l => {
        if (l.apps) {
            l.apps.forEach(app => appsInvolved.add(app));
        }
    });

    if (appsInvolved.size > 0) {
        html += `<div class="relations"><h4>Aplicativos Envolvidos:</h4>`;
        Array.from(appsInvolved).sort().forEach(appName => {
            html += `<div style="margin-bottom: 10px; padding: 5px; background: rgba(255,255,255,0.05); border-radius: 4px;">`;
            html += `<strong style="color: #64ffda;">${appName}</strong>`;
            const stats = fullData.app_stats && fullData.app_stats[appName];
            if (stats) {
                html += `<ul class="stats-list" style="font-size: 0.85em; margin: 4px 0 0 0; padding-left: 15px; list-style-type: none; display: flex; flex-wrap: wrap; gap: 8px;">`;
                for (const [key, value] of Object.entries(stats)) {
                    if (value > 0 || value !== "0") { // Only show stats that are greater than 0 to save space
                        html += `<li><span style="color: #aaa;">${key.replace('Qtd_', '')}:</span> <b style="color: #fff;">${value}</b></li>`;
                    }
                }
                html += `</ul>`;
            } else {
                html += `<div style="font-size: 0.85em; margin-top: 4px; color: #888;">Sem métricas</div>`;
            }
            html += `</div>`;
        });
        html += `</div>`;
    }

    detailsContent.innerHTML = html;
}

function showAppStats(appName) {
    const detailsContent = document.getElementById('details-content');
    const stats = fullData.app_stats && fullData.app_stats[appName];
    
    let html = `
        <div class="detail-item">
            <strong>Aplicativo:</strong>
            <span class="value">${appName}</span>
        </div>
    `;

    if (stats) {
        html += `<div class="relations"><h4>Métricas do Script</h4><ul class="stats-list">`;
        for (const [key, value] of Object.entries(stats)) {
            html += `<li><strong>${key.replace('Qtd_', '')}:</strong> ${value}</li>`;
        }
        html += `</ul></div>`;
    } else {
        html += `<p class="placeholder">Sem métricas adicionais para este aplicativo.</p>`;
    }
    
    detailsContent.innerHTML = html;
}

function clearDetails() {
    const selectedApp = d3.select("#app-filter").property("value");
    if (selectedApp && selectedApp !== "all") {
        showAppStats(selectedApp);
    } else {
        document.getElementById('details-content').innerHTML = '<p class="placeholder">Select a node to see details</p>';
    }
    d3.selectAll(".link")
        .classed("highlight", false)
        .classed("highlight-in", false)
        .classed("highlight-out", false)
        .classed("dimmed", false)
        .attr("marker-end", "url(#arrowhead)");
    d3.selectAll(".node").classed("highlight", false).classed("dimmed", false);
}

function focusNode(nodeId) {
    const node = d3.selectAll(".node").filter(d => d.id === nodeId).datum();
    if (node) {
        svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity.translate(width / 2, height / 2).scale(2).translate(-node.x, -node.y)
        );
        showDetails(node);
    }
}

function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
}

function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
}

function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
}

window.addEventListener('resize', () => {
    // Basic resize handling
    const newWidth = window.innerWidth - 350;
    const newHeight = window.innerHeight;
    svg.attr("width", newWidth).attr("height", newHeight);
});

init();
