import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as d3 from "d3";
import { fetchVizData } from "../Network";

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
    console.log("Starting visualization setup with progressive loading");

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    const camera = new THREE.PerspectiveCamera(
      60,
      width / height,
      0.01,
      10000
    );
    camera.position.set(1000, 1000, 1000);
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
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.5;
    controls.enableZoom = true;
    controls.zoomSpeed = 0.7;
    controls.enablePan = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.minDistance = 5;
    controls.maxDistance = 5000;

    // Add lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    // Limit data based on constant
    const activeItems = LIMIT_DATA ? items.slice(0, 200) : items;
    const itemMap = new Map(activeItems.map((item: Item) => [item.id, item]));
    
    // Filter votes based on active items
    const relevantVotes = votes
      .filter(vote => 
        itemMap.has(vote.left_item_id) && 
        itemMap.has(vote.right_item_id))
      .slice(0, LIMIT_DATA ? 300 : votes.length);

    console.log("Data sizes:", {
      rawItems: items.length,
      rawVotes: votes.length,
      activeItems: activeItems.length,
      validVotesBeforeSlice: votes.filter(vote => 
        itemMap.has(vote.left_item_id) && 
        itemMap.has(vote.right_item_id)).length,
      finalVotes: relevantVotes.length
    });

    const links = relevantVotes.map((vote: Vote) => ({
      source: itemMap.get(vote.left_item_id)!,
      target: itemMap.get(vote.right_item_id)!,
      value: vote.magnitude,
    }));

    // Set up force simulation
    const simulation = d3
      .forceSimulation<Item>(activeItems)
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(0, 0).strength(0.05))
      .force(
        "link",
        d3
          .forceLink<Item, any>(links)
          .id((d: Item) => d.id)
          .strength(0.1)
          .distance(30)
      )
      .force("x", d3.forceX().strength(0.02))
      .force("y", d3.forceY().strength(0.02))
      .force("z", d3.forceRadial(100, width / 2, height / 2).strength(0.02))
      .force("collision", d3.forceCollide().radius(20));

    // Progressive loading of nodes and links
    const BATCH_SIZE = 100;
    const BATCH_DELAY = 100;

    let activeNodes: THREE.InstancedMesh[] = [];
    let activeLinks: THREE.Line[] = [];

    const processNextBatch = async (startIndex: number) => {
      const batchItems = activeItems.slice(startIndex, startIndex + BATCH_SIZE);
      if (batchItems.length === 0) return;

      // Create nodes for this batch
      const geometry = new THREE.IcosahedronGeometry(5, 1);
      const material = new THREE.MeshPhongMaterial({ 
        shininess: 100,
        transparent: true,
        opacity: 0.8 
      });
      const nodeMesh = new THREE.InstancedMesh(
        geometry,
        material,
        batchItems.length
      );

      // Initialize nodes
      batchItems.forEach((item, index) => {
        const matrix = new THREE.Matrix4().setPosition(0, 0, 0);
        nodeMesh.setMatrixAt(index, matrix);
        const color = new THREE.Color(categoryColors[item.category]);
        nodeMesh.setColorAt(index, color);
      });

      scene.add(nodeMesh);
      activeNodes.push(nodeMesh);

      // Create relevant links
      const batchLinks = links.filter(link => 
        batchItems.includes(link.source) || 
        batchItems.includes(link.target)
      );

      const newLinks = batchLinks.map(link => {
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.LineBasicMaterial({
          color: 0xaaaaaa,
          opacity: 0.5,
          transparent: true,
          linewidth: Math.sqrt(link.value) / 10,
        });
        const line = new THREE.Line(geometry, material);
        scene.add(line);
        return line;
      });

      activeLinks.push(...newLinks);

      // Update positions
      simulation.on("tick", () => {
        activeItems.forEach((item, index) => {
          if (!item.z) item.z = (Math.random() - 0.5) * 100;
          const matrix = new THREE.Matrix4().setPosition(
            item.x,
            item.y,
            item.z
          );
          activeNodes.forEach(nodeMesh => {
            if (index < nodeMesh.count) {
              nodeMesh.setMatrixAt(index, matrix);
              nodeMesh.instanceMatrix.needsUpdate = true;
            }
          });
        });

        activeLinks.forEach((line, i) => {
          const link = links[i];
          const positions = new Float32Array([
            link.source.x,
            link.source.y,
            link.source.z,
            link.target.x,
            link.target.y,
            link.target.z,
          ]);
          line.geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3)
          );
          line.geometry.attributes.position.needsUpdate = true;
        });
      });

      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      await processNextBatch(startIndex + BATCH_SIZE);
    };

    // Start processing batches
    processNextBatch(0).then(() => {
      console.log("Finished loading all batches");
    });

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      simulation.stop();
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      activeNodes.forEach(nodeMesh => {
        nodeMesh.geometry.dispose();
        if (nodeMesh.material instanceof THREE.Material) {
          nodeMesh.material.dispose();
        }
      });
      activeLinks.forEach(line => {
        line.geometry.dispose();
        if (line.material instanceof THREE.Material) {
          line.material.dispose();
        }
      });
      controls.dispose();
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [width, height, items, votes, isLoading]);

  if (isLoading) {
    return <div>Loading visualization...</div>;
  }

  return (
    <div 
      className="container page-padding-top" 
      ref={containerRef}
      style={{ 
        width: '100%', 
        height: '100vh',
        position: 'relative'
      }}
    >
      <div className="controls-hint">
        <p>🖱️ Left click + drag to rotate</p>
        <p>🖱️ Right click + drag to pan</p>
        <p>🖱️ Scroll to zoom</p>
      </div>
    </div>
  );
};

export default AllSortViz;
