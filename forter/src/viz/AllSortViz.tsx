import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import * as d3 from "d3";
import rawSampleItems from "./items.json";
import rawSampleVotes from "./votes.json";

// These are the full datasets; they can crash your browser. Be careful!
// import rawSampleItems from "./full/items.json";
// import rawSampleVotes from "./full/votes.json";

/**
 * Wanted a place to stash this code.
 * Usage:
 *
 * <AllSortViz /> in index or something
 *
 */

interface Item {
  id: string;
  name: string;
  category: keyof typeof categoryColors;
  x: number;
  y: number;
  z: number;
}

interface Vote {
  left_item_id: string;
  right_item_id: string;
  magnitude: number;
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

// Type assertions for JSON imports
const sampleItems = rawSampleItems as unknown as Item[];
const sampleVotes = rawSampleVotes as unknown as Vote[];

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
const AllSortViz = ({ width = 800, height = 600 }: AllSortVizProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff); // Set white background
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(200, 200, 300);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Enable transparency
    });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0); // Make background transparent
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.5;
    controls.enableZoom = true;
    controls.zoomSpeed = 1.2;
    controls.enablePan = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    const itemMap = new Map(sampleItems.map((item: Item) => [item.id, item]));
    const links = sampleVotes.map((vote: Vote) => ({
      source: itemMap.get(vote.left_item_id)!,
      target: itemMap.get(vote.right_item_id)!,
      value: vote.magnitude,
    }));

    const geometry = new THREE.IcosahedronGeometry(5, 1);
    const material = new THREE.MeshPhongMaterial({ shininess: 100 });
    const nodeMesh = new THREE.InstancedMesh(
      geometry,
      material,
      sampleItems.length
    );
    scene.add(nodeMesh);

    sampleItems.forEach((item: Item, index: number) => {
      const matrix = new THREE.Matrix4().setPosition(
        item.x || 0,
        item.y || 0,
        item.z || 0
      );
      nodeMesh.setMatrixAt(index, matrix);
      const color = new THREE.Color(categoryColors[item.category]);
      nodeMesh.setColorAt(index, color);
    });

    const linkObjects = links.map((link: Link) => {
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

    const simulation = d3
      .forceSimulation<Item>(sampleItems)
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(0, 0).strength(0.05))
      .force(
        "link",
        d3
          .forceLink<Item, Link>(links)
          .id((d: Item) => d.id)
          .strength(0.1)
      )
      .force("x", d3.forceX().strength(0.02))
      .force("y", d3.forceY().strength(0.02))
      .force("z", d3.forceRadial(100, width / 2, height / 2).strength(0.02))
      .force("collision", d3.forceCollide().radius(20))
      .on("tick", () => {
        sampleItems.forEach((item, index) => {
          if (!item.z) item.z = (Math.random() - 0.5) * 100;
          const matrix = new THREE.Matrix4().setPosition(
            item.x,
            item.y,
            item.z
          );
          nodeMesh.setMatrixAt(index, matrix);
        });
        nodeMesh.instanceMatrix.needsUpdate = true;

        linkObjects.forEach((line, i) => {
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

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      simulation.stop();
      renderer.dispose();
      controls.dispose();
    };
  }, [width, height]);

  return (
    <div className="container" ref={containerRef}>
      <div className="controls-hint">
        <p>🖱️ Left click + drag to rotate</p>
        <p>🖱️ Right click + drag to pan</p>
        <p>🖱️ Scroll to zoom</p>
      </div>
    </div>
  );
};

export default AllSortViz;
