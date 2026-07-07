import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const COLORS = ["#0A84FF", "#34D3B8", "#30B463", "#6FE7A0"];

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function BallPit({ count = 26 }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const rand = seededRandom(7);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 8);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight("#ffffff", 0.85));
    const key = new THREE.DirectionalLight("#ffffff", 0.7);
    key.position.set(2, 3, 5);
    scene.add(key);
    const fill = new THREE.PointLight("#ffffff", 0.4, 20);
    fill.position.set(-3, -2, 4);
    scene.add(fill);

    const geometry = new THREE.SphereGeometry(1, 28, 28);
    const balls = [];

    let BOUND_X = 5.2;
    let BOUND_Y = 3.1;

    for (let i = 0; i < count; i++) {
      const colorHex = COLORS[Math.floor(rand() * COLORS.length)];
      const color = new THREE.Color(colorHex);

      const material = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.35,
        metalness: 0.08,
        clearcoat: 0.6,
        clearcoatRoughness: 0.2,
        transparent: true,
        opacity: 0.94,
        emissive: color,
        emissiveIntensity: 0.12,
      });

      const mesh = new THREE.Mesh(geometry, material);
      const scale = 0.22 + rand() * 0.34;
      mesh.scale.setScalar(scale);

      const fx = rand() - 0.5;
      const fy = rand() - 0.5;
      const baseZ = (rand() - 0.5) * 2.4;

      mesh.position.set(fx * BOUND_X * 2, fy * BOUND_Y * 2, baseZ);
      scene.add(mesh);

      balls.push({
        mesh,
        fx,
        fy,
        baseX: fx * BOUND_X * 2,
        baseY: fy * BOUND_Y * 2,
        x: fx * BOUND_X * 2,
        y: fy * BOUND_Y * 2,
        vx: 0,
        vy: 0,
        phase: rand() * Math.PI * 2,
        r: scale,
      });
    }

    let frameId;
    let cursor = null;
    let t = 0;

    function updateCursorFromEvent(e) {
      const rect = mount.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      const vector = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
      const dir = vector.sub(camera.position).normalize();
      const distance = (0 - camera.position.z) / dir.z;
      const point = camera.position.clone().add(dir.multiplyScalar(distance));
      cursor = { x: point.x, y: point.y };
    }

    function handlePointerMove(e) {
      updateCursorFromEvent(e);
    }

    function resize() {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      const vFov = (camera.fov * Math.PI) / 180;
      const distance = camera.position.z;
      const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
      const visibleWidth = visibleHeight * camera.aspect;
      BOUND_Y = (visibleHeight / 2) * 0.82;
      BOUND_X = (visibleWidth / 2) * 0.82;

      balls.forEach((b) => {
        b.baseX = b.fx * BOUND_X * 2;
        b.baseY = b.fy * BOUND_Y * 2;
      });
    }
    resize();
    window.addEventListener("resize", resize);
    if (!prefersReducedMotion) {
      window.addEventListener("pointermove", handlePointerMove);
    }

    const REPEL_RADIUS = 1.5;
    const REPEL_STRENGTH = 0.045;
    const SPRING = 0.02;
    const DAMPING = 0.88;

    function tick() {
      t += 0.01;

      balls.forEach((b) => {
        const floatY = Math.sin(t + b.phase) * 0.06;

        b.vx += (b.baseX - b.x) * SPRING;
        b.vy += (b.baseY + floatY - b.y) * SPRING;

        if (cursor) {
          const dx = b.x - cursor.x;
          const dy = b.y - cursor.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const minDist = REPEL_RADIUS + b.r;
          if (dist < minDist) {
            const push = (minDist - dist) * REPEL_STRENGTH;
            b.vx += (dx / dist) * push;
            b.vy += (dy / dist) * push;
          }
        }

        b.vx *= DAMPING;
        b.vy *= DAMPING;
        b.x += b.vx;
        b.y += b.vy;

        if (b.x > BOUND_X) b.vx -= (b.x - BOUND_X) * 0.02;
        if (b.x < -BOUND_X) b.vx -= (b.x + BOUND_X) * 0.02;
        if (b.y > BOUND_Y) b.vy -= (b.y - BOUND_Y) * 0.02;
        if (b.y < -BOUND_Y) b.vy -= (b.y + BOUND_Y) * 0.02;

        b.mesh.position.x = b.x;
        b.mesh.position.y = b.y;
        b.mesh.rotation.y += 0.002;
      });

      renderer.render(scene, camera);
      if (!prefersReducedMotion) {
        frameId = requestAnimationFrame(tick);
      }
    }
    tick();
    if (prefersReducedMotion) renderer.render(scene, camera);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      balls.forEach(({ mesh }) => {
        mesh.material.dispose();
        scene.remove(mesh);
      });
      geometry.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [count]);

  return (
    <div
      ref={mountRef}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}
