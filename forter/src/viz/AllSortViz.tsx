import React from 'react';
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as d3 from "d3";
import { fetchVizData } from "../Network";
import { VizErrorBoundary } from "./VizErrorBoundary";
import { DangerSlider } from "./components/DangerSlider";

/**
 * Wanted a place to stash this code.
 * Usage:
 *
 * <AllSortViz /> in index or something
 *
 */

const LIMIT_DATA = false;  // Toggle this to false to show all nodes

interface Item {
  id: string;
  name: string;
  category: keyof typeof categoryColors;
  x: number;
  y: number;
  z: number;
  owner: string;
  created_at: string;
}

interface Vote {
  left_item_id: string;
  right_item_id: string;
  magnitude: number;
  owner: string;
  created_at: string;
  attribute_name: string;
}

interface Link {
  source: Item;
  target: Item;
  value: number;
}

const categoryColors = {
  language: 0x4285f4, // Google Blue
  framework: 0xea4335, // Google Red
  database: 0x34a853, // Google Green
} as const;

interface AllSortVizProps {
  width?: number;
  height?: number;
}

interface RenderStats {
    renderedNodes: number;
    totalNodes: number;
    renderedLinks: number;
    totalLinks: number;
    fps: number;
    lastFrameTime: number;
}

/**
 * Basic 3D visualisation of all items and votes.
 * Informed by D3 force graphs.
 * Probably a bad implementation, please modify and fix and optimise.
 *
 * @param width - width of the container
 * @param height - height of the container
 * @returns - a div containing the 3D visualisation
 */
export const AllSortViz = ({ width = window.innerWidth, height = window.innerHeight }: AllSortVizProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [itemLimit, setItemLimit] = useState(150);  // Default: 150 nodes
  const [linkLimit, setLinkLimit] = useState(1000);  // Default: 1000 links
  const [renderStats, setRenderStats] = useState<RenderStats>({
    renderedNodes: 0,
    totalNodes: 0,
    renderedLinks: 0,
    totalLinks: 0,
    fps: 0,
    lastFrameTime: performance.now()
  });
  const linksRef = useRef<Link[]>([]);
  const activeNodesRef = useRef<THREE.InstancedMesh[]>([]);
  const activeLinksRef = useRef<THREE.Line[]>([]);
  const simulationRef = useRef<d3.Simulation<Item, undefined> | null>(null);
  const activeItemsRef = useRef<Item[]>([]);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const controlsRef = useRef<OrbitControls | null>(null);

  const isSafeMode = new URLSearchParams(window.location.search).has('safe');

  const handleReset = useCallback(() => {
    setItemLimit(Math.max(100, Math.floor(itemLimit * 0.5))); // Reduce by 50%
    setLinkLimit(Math.max(200, Math.floor(linkLimit * 0.5))); // Reduce links by 50%
  }, [itemLimit, linkLimit]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { items: itemsResponse, votes: votesResponse } = await fetchVizData();
        console.log("Raw data from backend:", { items: itemsResponse, votes: votesResponse });

        // Transform backend data to match visualization format
        const transformedItems = itemsResponse.map((item: any) => ({
          id: item.id.toString(),
          name: item.title,
          category: item.domain_pk_namespace as keyof typeof categoryColors || 'language',
          x: 0,
          y: 0,
          z: 0,
          owner: item.owner,
          created_at: item.created_at
        }));

        const transformedVotes = votesResponse.map((vote: any) => ({
          left_item_id: vote.left_item_id.toString(),
          right_item_id: vote.right_item_id.toString(),
          magnitude: vote.magnitude || 1,
          owner: vote.owner,
          created_at: vote.created_at,
          attribute_name: vote.attribute_name
        }));

        console.log("Transformed data:", { items: transformedItems, votes: transformedVotes });

        setItems(transformedItems);
        setVotes(transformedVotes);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching visualization data:', error);
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (!containerRef.current || isLoading) return;
    
    // In safe mode, just show debug info and don't start visualization
    if (isSafeMode) {
        console.log("Debug State:", {
            itemsLength: items.length,
            votesLength: votes.length,
            currentLinks: linksRef.current,
            currentActiveLinks: activeLinksRef.current
        });
        return;
    }

    console.log("Starting visualization setup with progressive loading");

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    const camera = new THREE.PerspectiveCamera(
      60,
      width / height,
      0.01,
      10000
    );
    camera.position.set(200, 200, 200);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    containerRef.current.appendChild(renderer.domElement);

    // Add orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.minDistance = 50;
    controls.maxDistance = 1000;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.5;
    controls.enableZoom = true;
    controls.zoomSpeed = 1.2;
    controls.enablePan = true;
    controls.autoRotate = isAutoRotating;
    controls.autoRotateSpeed = 0.5;

    // Add lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    // Limit data based on current limits
    const activeItems = items.slice(0, itemLimit);
    const itemMap = new Map(activeItems.map((item: Item) => [item.id, item]));
    
    // Filter and limit votes
    const relevantVotes = votes
      .filter(vote => 
        itemMap.has(vote.left_item_id) && 
        itemMap.has(vote.right_item_id))
      .slice(0, linkLimit);

    console.log("Data sizes:", {
      rawItems: items.length,
      rawVotes: votes.length,
      activeItems: activeItems.length,
      activeLinks: relevantVotes.length,
      itemLimit,
      linkLimit
    });

    // Create links array with valid references
    linksRef.current = relevantVotes.map(vote => ({
      source: itemMap.get(vote.left_item_id)!,
      target: itemMap.get(vote.right_item_id)!,
      value: vote.magnitude,
    }));

    // Store active items reference
    activeItemsRef.current = activeItems;

    // Update simulation creation with better force parameters
    const simulation = d3
        .forceSimulation<Item>(activeItems)
        .force("charge", d3.forceManyBody()
            .strength(-50)  // Reduced repulsion
            .distanceMin(5)
            .distanceMax(200))
        .force("center", d3.forceCenter()
            .x(0)
            .y(0)
            .strength(0.01))  // Very light centering force
        .force("collision", d3.forceCollide()
            .radius(5)  // Smaller collision radius
            .strength(0.5))
        .force("link", d3.forceLink<Item, Link>(linksRef.current)
            .id((d: Item) => d.id)
            .distance(30)  // Shorter link distance
            .strength(0.2));  // Moderate link strength

    simulationRef.current = simulation;

    // Progressive loading of nodes and links
    const BATCH_SIZE = 100;
    const BATCH_DELAY = 100;

    let isSimulationRunning = true;
    let animationFrameId: number;  // Declare at the top of the effect

    let frameCount = 0;
    let lastFpsUpdate = performance.now();
    const FPS_UPDATE_INTERVAL = 500; // Update FPS every 500ms

    // First, add a mapping to track node positions
    const nodePositions = new Map<string, THREE.Vector3>();

    // Add a mapping to track node indices
    const nodeIndexMap = new Map<string, number>();

    const createLinks = (items: Item[]) => {
        const itemMap = new Map(items.map(item => [item.id, item]));
        return votes
            .filter(vote => 
                itemMap.has(vote.left_item_id) && 
                itemMap.has(vote.right_item_id))
            .slice(0, linkLimit)
            .map(vote => ({
                source: itemMap.get(vote.left_item_id)!,
                target: itemMap.get(vote.right_item_id)!,
                value: vote.magnitude
            }));
    };

    const processNextBatch = async (startIndex: number) => {
        const batchItems = activeItems.slice(startIndex, startIndex + BATCH_SIZE);
        if (batchItems.length === 0) return;

        // Create nodes
        const geometry = new THREE.IcosahedronGeometry(3, 1);
        const material = new THREE.MeshPhongMaterial({ 
            shininess: 100,
            transparent: true,
            opacity: 0.9 
        });

        const instancedMesh = new THREE.InstancedMesh(
            geometry,
            material,
            batchItems.length
        );

        // Initialize node positions
        batchItems.forEach((item, index) => {
            const angle = Math.random() * Math.PI * 2;
            const radius = 50 + Math.random() * 50;
            item.x = Math.cos(angle) * radius;
            item.y = Math.sin(angle) * radius;
            item.z = (Math.random() - 0.5) * 50;

            const matrix = new THREE.Matrix4().setPosition(item.x, item.y, item.z);
            instancedMesh.setMatrixAt(index, matrix);
            const color = new THREE.Color(categoryColors[item.category]);
            instancedMesh.setColorAt(index, color);
        });

        instancedMesh.instanceMatrix.needsUpdate = true;
        if (instancedMesh.instanceColor) {
            instancedMesh.instanceColor.needsUpdate = true;
        }

        scene.add(instancedMesh);
        activeNodesRef.current.push(instancedMesh);

        // Create batch links
        const relevantLinks = linksRef.current.filter(link => {
            const sourceIndex = activeItems.indexOf(link.source);
            const targetIndex = activeItems.indexOf(link.target);
            return (sourceIndex >= startIndex && sourceIndex < startIndex + BATCH_SIZE) ||
                   (targetIndex >= startIndex && targetIndex < startIndex + BATCH_SIZE);
        });

        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0xaaaaaa,
            opacity: 0.3,
            transparent: true,
        });

        relevantLinks.forEach(link => {
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array([
                link.source.x || 0, link.source.y || 0, link.source.z || 0,
                link.target.x || 0, link.target.y || 0, link.target.z || 0
            ]);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            
            const line = new THREE.Line(geometry, lineMaterial);
            scene.add(line);
            activeLinksRef.current.push(line);
        });

        // Update simulation with original force parameters
        simulation
            .nodes(activeItems)
            .force("charge", d3.forceManyBody().strength(-200))  // Original strength
            .force("center", d3.forceCenter(0, 0).strength(0.05))  // Original center force
            .force("link", d3.forceLink(relevantLinks)
                .id((d: any) => d.id)
                .strength(0.1))  // Original link strength
            .force("x", d3.forceX().strength(0.02))  // Original X force
            .force("y", d3.forceY().strength(0.02))  // Original Y force
            .force("z", d3.forceRadial(100, width / 2, height / 2).strength(0.02))  // Original radial force
            .force("collision", d3.forceCollide().radius(20));  // Original collision radius

        // Update tick handler with original position updates
        simulation.on("tick", () => {
            if (!isSimulationRunning) return;

            try {
                // Update nodes
                batchItems.forEach((item, index) => {
                    if (!item.z) item.z = (Math.random() - 0.5) * 100;  // Original Z handling
                    const matrix = new THREE.Matrix4().setPosition(
                        item.x,
                        item.y,
                        item.z
                    );
                    instancedMesh.setMatrixAt(index, matrix);
                });
                instancedMesh.instanceMatrix.needsUpdate = true;

                // Update links
                activeLinksRef.current.forEach((line, i) => {
                    if (!line?.geometry || i >= relevantLinks.length) return;
                    const link = relevantLinks[i];
                    if (!link?.source || !link?.target) return;

                    const positions = new Float32Array([
                        link.source.x,
                        link.source.y,
                        link.source.z,
                        link.target.x,
                        link.target.y,
                        link.target.z
                    ]);
                    
                    line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    line.geometry.attributes.position.needsUpdate = true;
                });
            } catch (e) {
                console.warn("Simulation tick error:", e);
                isSimulationRunning = false;
                simulation.stop();
            }
        });

        simulation.alpha(0.3).restart();

        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        await processNextBatch(startIndex + BATCH_SIZE);
    };

    // Start processing batches
    processNextBatch(0).then(() => {
      console.log("Finished loading all batches");
    });

    // Add frustum for culling
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();

    // LOD geometry levels
    const geometryLevels = {
      high: new THREE.IcosahedronGeometry(5, 2),
      medium: new THREE.IcosahedronGeometry(5, 1),
      low: new THREE.IcosahedronGeometry(5, 0)
    };

    // Update LOD and visibility with safety checks
    const updateNodeVisibility = () => {
        if (!isSimulationRunning) return;

        camera.updateMatrixWorld();
        projScreenMatrix.multiplyMatrices(
            camera.projectionMatrix,
            camera.matrixWorldInverse
        );
        frustum.setFromProjectionMatrix(projScreenMatrix);

        let visibleNodes = 0;
        let visibleLinks = 0;

        // Safely update nodes
        activeNodesRef.current.forEach(nodeMesh => {
            if (!nodeMesh || !nodeMesh.geometry) return;
            
            const distance = camera.position.length();
            
            // Count visible nodes
            for (let i = 0; i < nodeMesh.count; i++) {
                try {
                    const matrix = new THREE.Matrix4();
                    nodeMesh.getMatrixAt(i, matrix);
                    const position = new THREE.Vector3();
                    position.setFromMatrixPosition(matrix);
                    
                    if (frustum.containsPoint(position)) {
                        visibleNodes++;
                    }
                } catch (e) {
                    console.warn("Error processing node:", e);
                }
            }
        });

        // Safely update links
        activeLinksRef.current.forEach(link => {
            if (!link || !link.geometry || !link.geometry.attributes.position) return;
            
            try {
                const positions = link.geometry.attributes.position.array;
                const start = new THREE.Vector3(positions[0], positions[1], positions[2]);
                const end = new THREE.Vector3(positions[3], positions[4], positions[5]);
                
                if (frustum.containsPoint(start) || frustum.containsPoint(end)) {
                    link.visible = true;
                    visibleLinks++;
                } else {
                    link.visible = false;
                }
            } catch (e) {
                console.warn("Error processing link:", e);
            }
        });

        // Update FPS calculation
        frameCount++;
        const currentTime = performance.now();
        const elapsedTime = currentTime - lastFpsUpdate;

        if (elapsedTime >= FPS_UPDATE_INTERVAL) {
            const fps = Math.round((frameCount * 1000) / elapsedTime);
            setRenderStats(prev => ({
                renderedNodes: visibleNodes,
                totalNodes: activeNodesRef.current.reduce((sum, mesh) => sum + (mesh?.count || 0), 0),
                renderedLinks: visibleLinks,
                totalLinks: activeLinksRef.current.length,
                fps,
                lastFrameTime: currentTime
            }));
            
            frameCount = 0;
            lastFpsUpdate = currentTime;
        }
    };

    // Animation loop with error boundary
    const animate = () => {
        if (!isSimulationRunning) return;
        
        try {
            animationFrameId = requestAnimationFrame(animate);
            controls.update();
            updateNodeVisibility();
            renderer.render(scene, camera);
        } catch (e) {
            console.error("Animation error:", e);
            isSimulationRunning = false;
        }
    };

    animate();

    // Cleanup
    return () => {
        isSimulationRunning = false;
        simulationRef.current?.stop();
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        
        // Clean up nodes
        activeNodesRef.current.forEach(nodeMesh => {
            if (nodeMesh) {
                nodeMesh.geometry.dispose();
                if (nodeMesh.material instanceof THREE.Material) {
                    nodeMesh.material.dispose();
                }
                scene.remove(nodeMesh);
            }
        });
        
        // Clean up links
        activeLinksRef.current.forEach(line => {
            if (line) {
                line.geometry.dispose();
                if (line.material instanceof THREE.Material) {
                    line.material.dispose();
                }
                scene.remove(line);
            }
        });
        
        renderer.dispose();
        controls.dispose();
        if (containerRef.current) {
            containerRef.current.removeChild(renderer.domElement);
        }
    };
  }, [width, height, items, votes, isLoading, itemLimit, linkLimit, isAutoRotating]);

  if (isLoading) {
    return <div>Loading visualization...</div>;
  }

  return (
    <VizErrorBoundary onReset={handleReset}>
      <div 
        className="container page-padding-top" 
        ref={containerRef}
        style={{ 
          width: '100%', 
          height: '100vh',
          position: 'relative'
        }}
      >
        <div className="stats-overlay" style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '10px',
          borderRadius: '5px',
          fontFamily: 'monospace',
          zIndex: 1000,
          width: '300px'
        }}>
          <div>FPS: {renderStats.fps}</div>
          <div>Visible Nodes: {renderStats.renderedNodes}/{renderStats.totalNodes}</div>
          <div>Active Connections: {renderStats.renderedLinks}/{renderStats.totalLinks}</div>
          
          <DangerSlider
            value={itemLimit}
            onChange={setItemLimit}
            min={25}
            max={items.length}
            defaultValue={150}
            zones={[
                { max: 400, color: '#28a745' },  // Bright green
                { max: 800, color: '#ffc107' },  // Bright yellow
                { max: items.length, color: '#dc3545' }  // Bright red
            ]}
            label="Visible Nodes"
            warningThreshold={800}
          />
          
          <DangerSlider
            value={linkLimit}
            onChange={setLinkLimit}
            min={100}
            max={votes.length}
            defaultValue={1000}
            zones={[
                { max: 2000, color: '#3d8b5f' },  // Muted green
                { max: 4500, color: '#d4b13d' },  // Muted gold
                { max: votes.length, color: '#a94442' }  // Muted red
            ]}
            label="Maximum Links"
            warningThreshold={4500}
          />
        </div>
        <div className="controls-hint">
          <p>🖱️ Left click + drag to rotate</p>
          <p>🖱️ Right click + drag to pan</p>
          <p>🖱️ Scroll to zoom</p>
          <button 
            onClick={() => {
              setIsAutoRotating(!isAutoRotating);
              if (controlsRef.current) {
                  controlsRef.current.autoRotate = !isAutoRotating;
              }
            }}
            style={{
              padding: '5px 10px',
              marginTop: '10px',
              background: isAutoRotating ? '#dc3545' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer'
            }}
          >
            {isAutoRotating ? '⏸ Stop Rotation' : '▶️ Start Rotation'}
          </button>
        </div>
      </div>
    </VizErrorBoundary>
  );
};

export default AllSortViz;
