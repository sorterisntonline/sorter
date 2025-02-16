import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as d3 from "d3";
import { fetchVizData } from "../Network";
import { VizErrorBoundary } from "./VizErrorBoundary";
import { DangerSlider } from "./components/DangerSlider";
import { WarningModal } from "./components/WarningModal";

/**
 * Wanted a place to stash this code.
 * Usage:
 *
 * <AllSortViz /> in index or something
 *
 */

const LIMIT_DATA = false;  // Toggle this to false to show all nodes

// Add these constants near the top of the file with other constants
const NODE_WARNING_THRESHOLD = 800;
const LINK_WARNING_THRESHOLD = 4500;

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

const initialRenderStats: RenderStats = {
    renderedNodes: 0,
    totalNodes: 0,
    renderedLinks: 0,
    totalLinks: 0,
    fps: 0,
    lastFrameTime: 0
};

// Add this new component above the AllSortViz component
const SpeedSlider = ({ value, onChange, min, max, label }: {
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    label: string;
}) => {
    return (
        <div style={{ marginTop: '10px' }}>
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                marginBottom: '5px'
            }}>
                <label>{label}</label>
                <span>{value.toFixed(1)}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={0.1}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                style={{ width: '100%' }}
            />
        </div>
    );
};

/**
 * Basic 3D visualisation of all items and votes.
 * Informed by D3 force graphs.
 * Probably a bad implementation, please modify and fix and optimise.
 *
 * @param width - width of the container
 * @param height - height of the container
 * @returns - a div containing the 3D visualisation
 */
export const AllSortViz = ({ width = 800, height = 600 }: AllSortVizProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const [isAutoRotating, setIsAutoRotating] = useState(true);
    const [itemLimit, setItemLimit] = useState(150);
    const [linkLimit, setLinkLimit] = useState(1000);
    const [pendingChanges, setPendingChanges] = useState(false);
    const [renderStats, setRenderStats] = useState(initialRenderStats);
    const [items, setItems] = useState<Item[]>([]);
    const [votes, setVotes] = useState<Vote[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Refs for cleanup
    const sceneRef = useRef<THREE.Scene | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const simulationRef = useRef<d3.Simulation<Item, undefined> | null>(null);
    const activeNodesRef = useRef<THREE.InstancedMesh[]>([]);
    const activeLinksRef = useRef<THREE.Line[]>([]);

    // Add state for current limits
    const [currentItemLimit, setCurrentItemLimit] = useState(150);
    const [currentLinkLimit, setCurrentLinkLimit] = useState(1000);

    const [showWarning, setShowWarning] = useState(false);
    const [rotationSpeed, setRotationSpeed] = useState(0.5);
    const [pendingRotationSpeed, setPendingRotationSpeed] = useState(0.5);
    const [showTooltip, setShowTooltip] = useState(false);
    const tooltipTimeoutRef = useRef<NodeJS.Timeout>();

    // Add new state at the top of the AllSortViz component
    const [showControlsHint, setShowControlsHint] = useState(true);

    // Add new refs to store camera and controls state
    const cameraStateRef = useRef<{
        position: THREE.Vector3;
        rotation: THREE.Euler;
        target: THREE.Vector3;
    }>();

    const cleanup = useCallback(() => {
        simulationRef.current?.stop();
        
        // Clean up nodes
        activeNodesRef.current.forEach(nodeMesh => {
            if (nodeMesh) {
                nodeMesh.geometry.dispose();
                if (nodeMesh.material instanceof THREE.Material) {
                    nodeMesh.material.dispose();
                }
                sceneRef.current?.remove(nodeMesh);
            }
        });
        activeNodesRef.current = [];
        
        // Clean up links
        activeLinksRef.current.forEach(line => {
            if (line) {
                line.geometry.dispose();
                if (line.material instanceof THREE.Material) {
                    line.material.dispose();
                }
                sceneRef.current?.remove(line);
            }
        });
        activeLinksRef.current = [];
    }, []);

    const initializeVisualization = useCallback(() => {
        if (!containerRef.current) return;
        cleanup();

        const activeItems = items.slice(0, currentItemLimit);
        const itemMap = new Map(activeItems.map(item => [item.id, item]));
        
        // Current link filtering logic
        const links = votes
            .filter(vote => 
                itemMap.has(vote.left_item_id) && 
                itemMap.has(vote.right_item_id))
            .slice(0, currentLinkLimit)
            .map(vote => ({
                source: itemMap.get(vote.left_item_id)!,
                target: itemMap.get(vote.right_item_id)!,
                value: vote.magnitude
            }));

        // Let's add some debugging to understand our link numbers
        console.log('Link statistics:', {
            totalVotes: votes.length,
            votesWithValidEndpoints: votes.filter(vote => 
                itemMap.has(vote.left_item_id) && 
                itemMap.has(vote.right_item_id)).length,
            linksAfterLimit: links.length,
            activeItemsCount: activeItems.length,
            uniqueItemsInVotes: new Set([
                ...votes.map(v => v.left_item_id),
                ...votes.map(v => v.right_item_id)
            ]).size
        });

        // Consider aggregating votes between the same pairs of items
        const aggregatedLinks = new Map<string, Link>();
        votes
            .filter(vote => 
                itemMap.has(vote.left_item_id) && 
                itemMap.has(vote.right_item_id))
            .forEach(vote => {
                const source = itemMap.get(vote.left_item_id)!;
                const target = itemMap.get(vote.right_item_id)!;
                const linkKey = [source.id, target.id].sort().join('-');
                
                if (aggregatedLinks.has(linkKey)) {
                    const existingLink = aggregatedLinks.get(linkKey)!;
                    existingLink.value += vote.magnitude;
                } else {
                    aggregatedLinks.set(linkKey, {
                        source,
                        target,
                        value: vote.magnitude
                    });
                }
            });

        // Use aggregated links instead of direct vote mapping
        const finalLinks = Array.from(aggregatedLinks.values())
            .slice(0, currentLinkLimit)
            .sort((a, b) => b.value - a.value); // Sort by magnitude

        console.log('Aggregated link statistics:', {
            totalAggregatedLinks: aggregatedLinks.size,
            finalLinksCount: finalLinks.length,
            magnitudeRange: finalLinks.length > 0 ? {
                min: Math.min(...finalLinks.map(l => l.value)),
                max: Math.max(...finalLinks.map(l => l.value))
            } : null
        });

        // Create nodes with updated geometry and material
        const geometry = new THREE.IcosahedronGeometry(5, 1);
        const material = new THREE.MeshPhongMaterial({ 
            shininess: 100,
            transparent: true,
            opacity: 0.9 
        });

        const nodeMesh = new THREE.InstancedMesh(
            geometry,
            material,
            activeItems.length
        );

        // Initialize node positions with better 3D distribution
        activeItems.forEach((item, index) => {
            // Initialize with random positions in a sphere
            const radius = 200;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            
            item.x = radius * Math.sin(phi) * Math.cos(theta);
            item.y = radius * Math.sin(phi) * Math.sin(theta);
            item.z = radius * Math.cos(phi);

            const matrix = new THREE.Matrix4().setPosition(item.x, item.y, item.z);
            nodeMesh.setMatrixAt(index, matrix);
            const color = new THREE.Color(categoryColors[item.category]);
            nodeMesh.setColorAt(index, color);
        });

        sceneRef.current?.add(nodeMesh);
        activeNodesRef.current = [nodeMesh];

        // Create links with updated material
        const maxMagnitude = Math.max(...finalLinks.map(link => link.value));
        const linkMeshes = finalLinks.map(link => {
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array([
                link.source.x || 0, link.source.y || 0, link.source.z || 0,
                link.target.x || 0, link.target.y || 0, link.target.z || 0
            ]);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            
            // Scale line opacity and width based on magnitude
            const normalizedValue = Math.min(1, link.value / maxMagnitude);
            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0xaaaaaa,
                opacity: 0.2 + (normalizedValue * 0.8), // Scale from 0.2 to 1.0
                transparent: true,
                linewidth: 1 + (normalizedValue * 2) // Scale from 1 to 3
            });
            
            const line = new THREE.Line(geometry, lineMaterial);
            sceneRef.current?.add(line);
            return line;
        });

        activeLinksRef.current = linkMeshes;

        // Updated force simulation configuration
        const simulation = d3.forceSimulation<Item>(activeItems)
            .force("charge", d3.forceManyBody().strength(-200))
            .force("center", d3.forceCenter(0, 0).strength(0.05))
            .force("link", d3.forceLink(finalLinks)
                .id((d: any) => d.id)
                .strength(0.1))
            .force("x", d3.forceX().strength(0.02))
            .force("y", d3.forceY().strength(0.02))
            .force("z", d3.forceRadial(100, width / 2, height / 2).strength(0.02))
            .force("collision", d3.forceCollide().radius(20));

        simulation.on("tick", () => {
            // Update node positions
            activeItems.forEach((item, index) => {
                if (!item.z) item.z = (Math.random() - 0.5) * 100;
                const matrix = new THREE.Matrix4().setPosition(
                    item.x || 0,
                    item.y || 0,
                    item.z || 0
                );
                nodeMesh.setMatrixAt(index, matrix);
            });
            nodeMesh.instanceMatrix.needsUpdate = true;

            // Update link positions
            linkMeshes.forEach((line, i) => {
                if (!line?.geometry || i >= finalLinks.length) return;
                const link = finalLinks[i];
                
                const positions = new Float32Array([
                    link.source.x || 0, link.source.y || 0, link.source.z || 0,
                    link.target.x || 0, link.target.y || 0, link.target.z || 0
                ]);
                
                line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                line.geometry.attributes.position.needsUpdate = true;
            });
        });

        simulationRef.current = simulation;
    }, [currentItemLimit, currentLinkLimit, items, votes, cleanup, width, height]);

    // Load data
    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true);
                const data = await fetchVizData();
                setItems(data.items);
                setVotes(data.votes);
            } catch (err) {
                setError(err instanceof Error ? err : new Error('Failed to load visualization data'));
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffff);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 2000);
        
        // If we have stored camera state, restore it, otherwise use default position
        if (cameraStateRef.current) {
            camera.position.copy(cameraStateRef.current.position);
            camera.rotation.copy(cameraStateRef.current.rotation);
        } else {
            camera.position.set(400, 400, 400);
        }

        // Use existing renderer if available
        let renderer = rendererRef.current;
        if (!renderer) {
            renderer = new THREE.WebGLRenderer({ antialias: true });
            rendererRef.current = renderer;
        }
        
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        if (!containerRef.current.contains(renderer.domElement)) {
            containerRef.current.appendChild(renderer.domElement);
        }

        const controls = new OrbitControls(camera, renderer.domElement);
        // Restore controls target if we have it
        if (cameraStateRef.current) {
            controls.target.copy(cameraStateRef.current.target);
        }
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.autoRotate = true;
        controls.autoRotateSpeed = rotationSpeed;
        controlsRef.current = controls;

        scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const pointLight = new THREE.PointLight(0xffffff, 1);
        pointLight.position.set(10, 10, 10);
        scene.add(pointLight);

        // Initialize visualization with current limits
        initializeVisualization();

        // Handle window resize
        const handleResize = () => {
            if (!containerRef.current) return;
            const width = containerRef.current.clientWidth;
            const height = containerRef.current.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer?.setSize(width, height);
        };
        window.addEventListener('resize', handleResize);

        // Add frameId declaration
        let frameId: number;
        let lastTime = performance.now();
        
        const animate = () => {
            frameId = requestAnimationFrame(animate);
            const currentTime = performance.now();
            const deltaTime = currentTime - lastTime;
            lastTime = currentTime;

            controls.update();
            renderer?.render(scene, camera);

            setRenderStats(prev => ({
                ...prev,
                renderedNodes: activeNodesRef.current.reduce((sum, mesh) => sum + mesh.count, 0),
                totalNodes: items.length,
                renderedLinks: activeLinksRef.current.length,
                totalLinks: votes.length,
                fps: Math.round(1000 / deltaTime),
                lastFrameTime: deltaTime
            }));
        };
        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(frameId);
        };
    }, [width, height, rotationSpeed, initializeVisualization, cleanup, items.length, votes.length]);

    // Add handleReset function
    const handleReset = useCallback(() => {
        setItemLimit(Math.max(itemLimit / 2, 25));
        setLinkLimit(Math.max(linkLimit / 2, 100));
        initializeVisualization();
    }, [itemLimit, linkLimit, initializeVisualization]);

    const handleLoadChanges = () => {
        const isInDangerZone = itemLimit > NODE_WARNING_THRESHOLD || linkLimit > LINK_WARNING_THRESHOLD;
        
        if (isInDangerZone) {
            setShowWarning(true);
        } else {
            applyChanges();
        }
    };

    const applyChanges = () => {
        // Store current camera and controls state before reinitializing
        if (controlsRef.current && controlsRef.current.object instanceof THREE.PerspectiveCamera) {
            const camera = controlsRef.current.object;
            cameraStateRef.current = {
                position: camera.position.clone(),
                rotation: camera.rotation.clone(),
                target: controlsRef.current.target.clone()
            };
        }

        setPendingChanges(false);
        setCurrentItemLimit(itemLimit);
        setCurrentLinkLimit(linkLimit);
        setRotationSpeed(pendingRotationSpeed);
        if (controlsRef.current) {
            controlsRef.current.autoRotate = pendingRotationSpeed > 0;
            controlsRef.current.autoRotateSpeed = pendingRotationSpeed;
        }
        initializeVisualization();
    };

    const handleWarningCancel = () => {
        setShowWarning(false);
        setItemLimit(currentItemLimit);
        setLinkLimit(currentLinkLimit);
        setPendingRotationSpeed(rotationSpeed);
        setPendingChanges(false);
    };

    if (isLoading) return <div>Loading visualization data...</div>;
    if (error) throw error; // VizErrorBoundary will catch this

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
                    top: '20px',
                    left: '20px',
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
                    <div>Visible Links: {renderStats.renderedLinks}/{renderStats.totalLinks}</div>
                    
                    <DangerSlider
                        value={itemLimit}
                        onChange={(value) => {
                            setItemLimit(value);
                            setPendingChanges(true);
                        }}
                        min={25}
                        max={items.length}
                        defaultValue={150}
                        zones={[
                            { max: 400, color: '#28a745' },
                            { max: 800, color: '#ffc107' },
                            { max: items.length, color: '#dc3545' }
                        ]}
                        label="Visible Nodes"
                        warningThreshold={800}
                    />
                    
                    <DangerSlider
                        value={linkLimit}
                        onChange={(value) => {
                            setLinkLimit(value);
                            setPendingChanges(true);
                        }}
                        min={100}
                        max={votes.length}
                        defaultValue={1000}
                        zones={[
                            { max: 2000, color: '#3d8b5f' },
                            { max: 4500, color: '#d4b13d' },
                            { max: votes.length, color: '#a94442' }
                        ]}
                        label="Maximum Links"
                        warningThreshold={4500}
                    />

                    <SpeedSlider
                        value={pendingRotationSpeed}
                        onChange={(value) => {
                            setPendingRotationSpeed(value);
                            setPendingChanges(true);
                        }}
                        min={0}
                        max={5}
                        label="Rotation Speed"
                    />

                    {pendingChanges && (
                        <button
                            onClick={handleLoadChanges}
                            style={{
                                width: '100%',
                                padding: '8px',
                                marginTop: '10px',
                                background: '#007bff',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer'
                            }}
                        >
                            Load Changes
                        </button>
                    )}
                </div>

                <div style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                }}>
                    {showControlsHint && (
                        <div 
                            onClick={() => setShowControlsHint(false)}
                            style={{
                                position: 'absolute',
                                top: '20px',
                                right: '20px',
                                background: 'rgba(0,0,0,0.7)',
                                color: 'white',
                                padding: '20px',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                zIndex: 1000,
                                minWidth: '300px'
                            }}
                        >
                            <p style={{ 
                                margin: '12px 0',
                                lineHeight: '1'
                            }}>🖱️ Left click + drag to rotate</p>
                            <p style={{ 
                                margin: '12px 0',
                                lineHeight: '1'
                            }}>🖱️ Right click + drag to pan</p>
                            <p style={{ 
                                margin: '12px 0',
                                lineHeight: '1'
                            }}>🖱️ Scroll to zoom</p>
                        </div>
                    )}
                </div>

                <WarningModal
                    isOpen={showWarning}
                    onConfirm={() => {
                        setShowWarning(false);
                        applyChanges();
                    }}
                    onCancel={handleWarningCancel}
                />
            </div>
        </VizErrorBoundary>
    );
};

export default AllSortViz;
