import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/*
 * Deep-space background: a slowly rotating point cloud of 5,000 cyan stars
 * in a 100-unit cube, drawn with WebGL over a near-black void with a soft
 * vertical fade. Points rotate on X and Y over time. Under
 * prefers-reduced-motion the cloud is drawn once and left still.
 */

const COUNT = 5000;
const CYAN = 0x00f5ff;

export function DynamicSpaceBackground() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.z = 10;

    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT * 3; i++) pos[i] = (Math.random() - 0.5) * 100;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: CYAN,
      size: 0.15,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    const start = performance.now();
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      points.rotation.x = t * 0.05;
      points.rotation.y = t * 0.03;
      renderer.render(scene, camera);
    };
    const tick = () => {
      draw();
      raf = requestAnimationFrame(tick);
    };
    if (reduce) {
      draw();
    } else {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0 bg-[#030508]" aria-hidden="true">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#030508]/50 via-transparent to-[#030508]/80 pointer-events-none" />
    </div>
  );
}
