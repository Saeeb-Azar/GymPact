// Realistischer 3D-Körper (MakeHuman-Mesh, CC0) mit Muskelgruppen.
// Imperativ mit three.js; gesteuert von Body3D.tsx und nur bei Bedarf geladen.
//
// - 360° drehen per Wischen (mit Schwung), leichtes Neigen nach oben/unten
// - Muskel antippen → Figur dreht sich zur Seite des Muskels, Kamera zoomt,
//   Muskel pulsiert rot; trainierte Muskeln leuchten grün (Heatmap)
// - Mann/Frau als Morph-Target → fließender Übergang

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { MuscleGroup } from '@/lib/database.types';

/** Gruppen-IDs 1..12 wie in scripts/build-body-model.mjs */
export const GROUP_ORDER: MuscleGroup[] = [
  'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs',
  'back', 'traps', 'glutes', 'quads', 'hamstrings', 'calves',
];

export interface BodyScene3DOptions {
  onSelect: (m: MuscleGroup | null) => void;
  onHover?: (m: MuscleGroup | null) => void;
  onReady?: () => void;
}

interface GroupInfo {
  center: THREE.Vector3;
  height: number;
  /** Winkel (rad), in dem die Figur gedreht sein muss, damit der Muskel zur Kamera zeigt */
  facing: number;
}

const HEIGHT = 1.8;

export async function loadBodyData(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Körpermodell konnte nicht geladen werden');
  const buf = await res.arrayBuffer();
  const dv = new DataView(buf);
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (magic !== 'GPB1') throw new Error('Ungültiges Körpermodell');
  const nV = dv.getUint32(4, true);
  const nI = dv.getUint32(8, true);
  const f = (i: number) => dv.getFloat32(12 + i * 4, true);
  const min = [f(0), f(1), f(2)];
  const max = [f(3), f(4), f(5)];
  const eyeL = [f(6), f(7), f(8)];
  const eyeR = [f(9), f(10), f(11)];
  const eyeRadius = f(12);
  let off = 12 + 13 * 4;
  const deq = (q: Int16Array) => {
    const out = new Float32Array(nV * 3);
    for (let i = 0; i < nV * 3; i++) {
      const k = i % 3;
      out[i] = min[k] + ((q[i] + 32767) / 65534) * (max[k] - min[k]);
    }
    return out;
  };
  const male = deq(new Int16Array(buf.slice(off, off + nV * 6)));
  off += nV * 6;
  const female = deq(new Int16Array(buf.slice(off, off + nV * 6)));
  off += nV * 6;
  const groups = new Uint8Array(buf.slice(off, off + nV));
  off += Math.ceil(nV / 4) * 4;
  const index = new Uint16Array(buf.slice(off, off + nI * 2));
  return { nV, male, female, groups, index, min, max, eyeL, eyeR, eyeRadius };
}

type BodyData = Awaited<ReturnType<typeof loadBodyData>>;

export class BodyScene3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.05, 30);
  private pivot = new THREE.Group();
  private mesh!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  private groupAttr!: Float32Array;
  private groupInfo = new Map<MuscleGroup, GroupInfo>();
  private neighbors: Uint32Array[] = [];
  private selAttr!: THREE.BufferAttribute;
  private heatAttr!: THREE.BufferAttribute;
  private hoverAttr!: THREE.BufferAttribute;
  private heatByGroup = new Array(13).fill(0) as number[];
  private uniforms = {
    uTime: { value: 0 },
    uDim: { value: 0 },
    uHeatColor: { value: new THREE.Color('#0fcb84') },
    uSelColor: { value: new THREE.Color('#f43f5e') },
  };
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private clock = new THREE.Clock();
  private frame = 0;
  private ro: ResizeObserver;
  private disposed = false;

  private yaw = -0.5;
  private yawTarget = 0;
  private yawVel = 0;
  private pitch = 0.05;
  private pitchTarget = 0.05;
  private camY = HEIGHT * 0.52;
  private camYTarget = HEIGHT * 0.52;
  private dist = 4.6;
  private distTarget = 4.6;
  private morph = 0;
  private morphTarget = 0;
  private dimTarget = 0;
  private selected: MuscleGroup | null = null;
  private hovered: MuscleGroup | null = null;
  private drag: { x: number; y: number; t: number; moved: boolean; id: number } | null = null;
  private lastInteraction = 0;

  constructor(
    private container: HTMLElement,
    data: BodyData,
    private opts: BodyScene3DOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const el = this.renderer.domElement;
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.touchAction = 'pan-y';
    el.style.cursor = 'grab';
    container.appendChild(el);

    // Weiche Studio-Reflexionen
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    pmrem.dispose();

    this.setupLights();
    this.buildBody(data);
    this.scene.add(this.pivot);
    this.addFloor();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.bind();
    this.loop();
    opts.onReady?.();
  }

  // ------------------------------------------------------------ API
  setHeat(heat: Map<MuscleGroup, number>) {
    GROUP_ORDER.forEach((g, i) => (this.heatByGroup[i + 1] = Math.max(0, Math.min(1, heat.get(g) ?? 0))));
    this.fillMask(this.heatAttr, (gi) => this.heatByGroup[gi]);
  }

  /** Wert je Gruppe auf die Vertices schreiben und an den Rändern weich auslaufen lassen. */
  private fillMask(attr: THREE.BufferAttribute, value: (group: number) => number) {
    const n = this.groupAttr.length;
    let a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = this.groupAttr[i] > 0 ? value(this.groupAttr[i]) : 0;
    for (let it = 0; it < 3; it++) {
      const b = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const nb = this.neighbors[i];
        let s = a[i] * 2;
        for (let k = 0; k < nb.length; k++) s += a[nb[k]];
        b[i] = s / (nb.length + 2);
      }
      a = b;
    }
    (attr.array as Float32Array).set(a);
    attr.needsUpdate = true;
  }

  setSelected(m: MuscleGroup | null) {
    this.selected = m;
    const sel = m ? GROUP_ORDER.indexOf(m) + 1 : -1;
    this.fillMask(this.selAttr, (gi) => (gi === sel ? 1 : 0));
    this.dimTarget = m ? 1 : 0;
    const info = m ? this.groupInfo.get(m) : undefined;
    if (info) {
      // Auf dem kürzesten Weg zur Seite des Muskels drehen
      const turns = Math.round((this.yaw - info.facing) / (Math.PI * 2));
      this.yawTarget = info.facing + turns * Math.PI * 2;
      this.yawVel = 0;
      this.camYTarget = info.center.y;
      this.distTarget = THREE.MathUtils.clamp(info.height * 3.2 + 1.2, 2.2, 4.2);
      this.pitchTarget = 0.02;
    } else {
      this.camYTarget = HEIGHT * 0.52;
      this.distTarget = 4.6;
    }
  }

  setGender(female: boolean) {
    this.morphTarget = female ? 1 : 0;
  }

  /** Vorder- oder Rückseite zeigen */
  face(side: 'front' | 'back') {
    const base = side === 'back' ? Math.PI : 0;
    const turns = Math.round((this.yaw - base) / (Math.PI * 2));
    this.yawTarget = base + turns * Math.PI * 2;
    this.yawVel = 0;
    this.lastInteraction = performance.now();
  }

  setDark(dark: boolean) {
    this.mesh.material.color.set(dark ? '#8e95a3' : '#a3aab6');
    this.mesh.material.sheenColor.set(dark ? '#cfd6e4' : '#ffffff');
    this.renderer.toneMappingExposure = dark ? 0.95 : 1.05;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.ro.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
    el.removeEventListener('pointermove', this.onHoverMove);
    el.removeEventListener('pointerleave', this.onHoverLeave);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m: THREE.Material & { map?: THREE.Texture | null }) => {
          m.map?.dispose();
          m.dispose();
        });
      }
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
    el.remove();
  }

  // ------------------------------------------------------------ Aufbau
  private setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x14161c, 0.45));
    const key = new THREE.DirectionalLight(0xfff6ee, 2.6);
    key.position.set(2.5, 4, 4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe6ff, 0.45);
    fill.position.set(-3, 2, 2);
    this.scene.add(fill);
    // Kantenlichter geben Volumen und die Markenfarben
    const rimA = new THREE.DirectionalLight(0x2ee39d, 2.2);
    rimA.position.set(-3, 2.5, -3);
    this.scene.add(rimA);
    const rimB = new THREE.DirectionalLight(0x8b5cf6, 1.8);
    rimB.position.set(3, 1.5, -3);
    this.scene.add(rimB);
  }

  private buildBody(d: BodyData) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(d.male, 3));
    geo.setIndex(new THREE.BufferAttribute(d.index, 1));
    geo.computeVertexNormals();
    const maleNormals = (geo.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array;

    // Morph Mann → Frau (relativ)
    const tmp = new THREE.BufferGeometry();
    tmp.setAttribute('position', new THREE.BufferAttribute(d.female, 3));
    tmp.setIndex(new THREE.BufferAttribute(d.index, 1));
    tmp.computeVertexNormals();
    const femaleNormals = (tmp.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array;
    const dPos = new Float32Array(d.male.length);
    const dNor = new Float32Array(d.male.length);
    for (let i = 0; i < d.male.length; i++) {
      dPos[i] = d.female[i] - d.male[i];
      dNor[i] = femaleNormals[i] - maleNormals[i];
    }
    tmp.dispose();
    geo.morphAttributes.position = [new THREE.BufferAttribute(dPos, 3)];
    geo.morphAttributes.normal = [new THREE.BufferAttribute(dNor, 3)];
    geo.morphTargetsRelative = true;

    this.groupAttr = new Float32Array(d.nV);
    for (let i = 0; i < d.nV; i++) this.groupAttr[i] = d.groups[i];
    this.selAttr = new THREE.BufferAttribute(new Float32Array(d.nV), 1);
    this.heatAttr = new THREE.BufferAttribute(new Float32Array(d.nV), 1);
    this.hoverAttr = new THREE.BufferAttribute(new Float32Array(d.nV), 1);
    geo.setAttribute('aSel', this.selAttr);
    geo.setAttribute('aHeat', this.heatAttr);
    geo.setAttribute('aHover', this.hoverAttr);

    // Nachbarschaft für weiche Übergänge zwischen Muskelgruppen
    const sets: Set<number>[] = Array.from({ length: d.nV }, () => new Set<number>());
    for (let t = 0; t < d.index.length; t += 3) {
      const [a, b, c] = [d.index[t], d.index[t + 1], d.index[t + 2]];
      sets[a].add(b).add(c);
      sets[b].add(a).add(c);
      sets[c].add(a).add(b);
    }
    this.neighbors = sets.map((s) => Uint32Array.from(s));

    // Auf Füße bei y=0, zentriert, Höhe HEIGHT normieren
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const scale = HEIGHT / (bb.max.y - bb.min.y);
    const cx = (bb.min.x + bb.max.x) / 2;
    const cz = (bb.min.z + bb.max.z) / 2;

    const mat = new THREE.MeshPhysicalMaterial({
      color: '#8e95a3',
      roughness: 0.46,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.45,
      sheen: 0.5,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color('#cfd6e4'),
      envMapIntensity: 0.7,
    });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aSel;
          attribute float aHeat;
          attribute float aHover;
          varying float vHeat;
          varying float vSel;
          varying float vHover;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vHeat = aHeat;
          vSel = aSel;
          vHover = aHover;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          uniform float uDim;
          uniform vec3 uHeatColor;
          uniform vec3 uSelColor;
          varying float vHeat;
          varying float vSel;
          varying float vHover;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float heat = vHeat * (1.0 - 0.7 * uDim);
          diffuseColor.rgb = mix(diffuseColor.rgb, uHeatColor * 0.9, clamp(heat * 0.55 + vHover * 0.4, 0.0, 0.8));
          float pulse = 0.8 + 0.2 * sin(uTime * 4.0);
          float sel = smoothstep(0.08, 0.6, vSel);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSelColor, sel * pulse);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += uSelColor * smoothstep(0.08, 0.6, vSel) * (0.16 + 0.1 * sin(uTime * 4.0));
          totalEmissiveRadiance += uHeatColor * vHeat * 0.06 * (1.0 - uDim);`,
        );
    };

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.morphTargetInfluences = [0];
    this.mesh.scale.setScalar(scale);
    this.mesh.position.set(-cx * scale, -bb.min.y * scale, -cz * scale);
    this.pivot.add(this.mesh);

    // Mittelpunkt & Blickrichtung je Muskelgruppe
    const pos = d.male;
    const nor = maleNormals;
    GROUP_ORDER.forEach((g, gi) => {
      const id = gi + 1;
      const c = new THREE.Vector3();
      let n = 0;
      let nz = 0;
      let nx = 0;
      let ymin = Infinity;
      let ymax = -Infinity;
      for (let i = 0; i < d.nV; i++) {
        if (d.groups[i] !== id) continue;
        c.x += pos[i * 3];
        c.y += pos[i * 3 + 1];
        c.z += pos[i * 3 + 2];
        nx += nor[i * 3];
        nz += nor[i * 3 + 2];
        ymin = Math.min(ymin, pos[i * 3 + 1]);
        ymax = Math.max(ymax, pos[i * 3 + 1]);
        n++;
      }
      if (!n) return;
      c.divideScalar(n);
      const world = new THREE.Vector3((c.x - cx) * scale, (c.y - bb.min.y) * scale, (c.z - cz) * scale);
      // Seitliche Muskeln (Schultern, Unterarme) leicht schräg zeigen
      const facing = nz >= 0 ? (Math.abs(nx) > Math.abs(nz) * 2 ? -0.5 : 0) : Math.PI;
      this.groupInfo.set(g, { center: world, height: (ymax - ymin) * scale, facing });
    });
  }

  private addFloor() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.45, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.8),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    this.scene.add(shadow);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.48, 0.5, 96),
      new THREE.MeshBasicMaterial({ color: '#0fcb84', transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.003;
    this.scene.add(ring);
  }

  // ------------------------------------------------------------ Eingabe
  private bind() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('pointermove', this.onHoverMove);
    el.addEventListener('pointerleave', this.onHoverLeave);
  }

  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, id: e.pointerId };
    this.yawVel = 0;
    this.renderer.domElement.style.cursor = 'grabbing';
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 6) d.moved = true;
    if (!d.moved) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.t);
    const w = this.container.clientWidth || 300;
    const dyaw = (dx / w) * Math.PI * 1.6;
    this.yaw += dyaw;
    this.yawTarget = this.yaw;
    this.yawVel = (dyaw / dt) * 16;
    this.pitchTarget = THREE.MathUtils.clamp(this.pitchTarget + dy * 0.002, -0.25, 0.35);
    d.x = e.clientX;
    d.y = e.clientY;
    d.t = now;
    this.lastInteraction = now;
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    this.renderer.domElement.style.cursor = 'grab';
    if (d.moved) return;
    const hit = this.pick(e);
    this.opts.onSelect(hit === this.selected ? null : hit);
  };

  private onCancel = () => {
    this.drag = null;
  };

  private onHoverMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || this.drag) return;
    const hit = this.pick(e);
    if (hit !== this.hovered) {
      this.hovered = hit;
      const hv = hit ? GROUP_ORDER.indexOf(hit) + 1 : -1;
      this.fillMask(this.hoverAttr, (gi) => (gi === hv ? 1 : 0));
      this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      this.opts.onHover?.(hit);
    }
  };

  private onHoverLeave = () => {
    if (this.hovered) {
      this.hovered = null;
      this.fillMask(this.hoverAttr, () => 0);
      this.opts.onHover?.(null);
    }
  };

  private pick(e: PointerEvent): MuscleGroup | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.mesh, false)[0];
    if (!hit?.face) return null;
    // Gruppe des nächsten Eckpunkts; Eckpunkte ohne Gruppe nur als letzte Wahl
    const verts = [hit.face.a, hit.face.b, hit.face.c];
    const pos = this.mesh.geometry.getAttribute('position');
    const local = this.mesh.worldToLocal(hit.point.clone());
    let best = 0;
    let bestD = Infinity;
    for (const v of verts) {
      const g = this.groupAttr[v];
      const dist = local.distanceToSquared(new THREE.Vector3().fromBufferAttribute(pos, v));
      const score = g > 0 ? dist : dist * 4 + 1e6;
      if (score < bestD) {
        bestD = score;
        best = g;
      }
    }
    return best > 0 ? GROUP_ORDER[best - 1] : null;
  }

  // ------------------------------------------------------------ Loop
  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Schmale Container (Auswahl-Layout) → Kamera etwas weiter weg
    this.camera.fov = w / h < 0.55 ? 30 : 26;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    this.uniforms.uTime.value += dt;

    const idle = performance.now() - this.lastInteraction > 3000;
    if (!this.drag) {
      if (Math.abs(this.yawVel) > 0.0005) {
        // Schwung nach dem Loslassen
        this.yaw += this.yawVel;
        this.yawTarget = this.yaw;
        this.yawVel *= 0.93;
      } else if (!this.selected && idle) {
        this.yawTarget += dt * 0.35;
      }
    }
    const k = 1 - Math.exp(-dt * 6);
    if (!this.drag) this.yaw += (this.yawTarget - this.yaw) * k;
    this.pitch += (this.pitchTarget - this.pitch) * k;
    this.camY += (this.camYTarget - this.camY) * k;
    this.dist += (this.distTarget - this.dist) * k;
    this.morph += (this.morphTarget - this.morph) * (1 - Math.exp(-dt * 4));
    this.uniforms.uDim.value += (this.dimTarget - this.uniforms.uDim.value) * k;
    this.mesh.morphTargetInfluences![0] = this.morph;

    this.pivot.rotation.y = this.yaw;
    this.camera.position.set(0, this.camY + Math.sin(this.pitch) * this.dist, Math.cos(this.pitch) * this.dist);
    this.camera.lookAt(0, this.camY, 0);
    this.renderer.render(this.scene, this.camera);
  };
}
