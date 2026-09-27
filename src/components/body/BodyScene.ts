// Imperatives three.js-Modell eines stilisierten Menschen mit anklickbaren
// Muskelgruppen. Wird von BodyModel.tsx (React) gesteuert und lazy geladen.

import * as THREE from 'three';
import type { MuscleGroup } from '@/lib/database.types';

export interface BodySceneOptions {
  onSelect: (muscle: MuscleGroup | null) => void;
  onHover?: (muscle: MuscleGroup | null) => void;
}

const BACK_MUSCLES: MuscleGroup[] = ['traps', 'back', 'triceps', 'glutes', 'hamstrings', 'calves'];

const COLORS = {
  dark: { skin: 0x2b2f3a, muscle: 0x4a5266, heat: 0x0fcb84, select: 0xf43f5e },
  light: { skin: 0xd9dde6, muscle: 0xb3bac9, heat: 0x05a56b, select: 0xe11d48 },
};

export class BodyScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private body = new THREE.Group();
  private skinMat: THREE.MeshPhysicalMaterial;
  private muscles = new Map<MuscleGroup, THREE.Mesh[]>();
  private pickables: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private frame = 0;
  private clock = new THREE.Clock();
  private ro: ResizeObserver;
  private disposed = false;

  private heat = new Map<MuscleGroup, number>();
  private selected: MuscleGroup | null = null;
  private hovered: MuscleGroup | null = null;
  private dark = true;

  private rotY = 0.6;
  private targetRotY = 0;
  private autoRotate = true;
  private camY = 1.0;
  private camDist = 4.1;
  private drag: { x: number; y: number; moved: boolean; id: number } | null = null;
  private lastInteraction = 0;

  constructor(
    private container: HTMLElement,
    private opts: BodySceneOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'pan-y';
    container.appendChild(this.renderer.domElement);

    this.skinMat = new THREE.MeshPhysicalMaterial({
      color: COLORS.dark.skin,
      roughness: 0.55,
      clearcoat: 0.5,
      clearcoatRoughness: 0.4,
    });

    this.setupLights();
    this.buildBody();
    this.scene.add(this.body);
    this.addShadow();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.bindEvents();
    this.applyColors();
    this.loop();
  }

  // ------------------------------------------------------------ Öffentliche API
  setHeat(heat: Map<MuscleGroup, number>) {
    this.heat = heat;
    this.applyColors();
  }

  setSelected(m: MuscleGroup | null) {
    this.selected = m;
    if (m) {
      const back = BACK_MUSCLES.includes(m);
      // Zur passenden Seite drehen – auf dem kürzesten Weg
      const base = back ? Math.PI : 0;
      const turns = Math.round((this.rotY - base) / (Math.PI * 2));
      this.targetRotY = base + turns * Math.PI * 2;
      this.autoRotate = false;
    } else {
      this.targetRotY = this.rotY;
      this.autoRotate = true;
    }
    this.applyColors();
  }

  setDark(dark: boolean) {
    this.dark = dark;
    this.skinMat.color.setHex(dark ? COLORS.dark.skin : COLORS.light.skin);
    this.applyColors();
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
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          (m as THREE.MeshStandardMaterial).map?.dispose();
          m.dispose();
        });
      }
    });
    this.renderer.dispose();
    el.remove();
  }

  // ------------------------------------------------------------ Aufbau
  private setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1c24, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 3.5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-3, 1, 2);
    this.scene.add(fill);
    const rimMint = new THREE.PointLight(0x2ee39d, 6, 8);
    rimMint.position.set(-1.6, 2, -1.8);
    this.scene.add(rimMint);
    const rimViolet = new THREE.PointLight(0x8b5cf6, 6, 8);
    rimViolet.position.set(1.6, 1.2, -1.8);
    this.scene.add(rimViolet);
  }

  private sphere = new THREE.SphereGeometry(1, 40, 28);

  private ellipsoid(
    parent: THREE.Object3D,
    s: [number, number, number],
    p: [number, number, number],
    mat: THREE.Material,
    rotZ = 0,
    rotX = 0,
  ) {
    const m = new THREE.Mesh(this.sphere, mat);
    m.scale.set(...s);
    m.position.set(...p);
    m.rotation.z = rotZ;
    m.rotation.x = rotX;
    parent.add(m);
    return m;
  }

  private capsule(parent: THREE.Object3D, r: number, len: number, p: [number, number, number], rotZ = 0) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 10, 24), this.skinMat);
    m.position.set(...p);
    m.rotation.z = rotZ;
    parent.add(m);
    return m;
  }

  private muscleMat() {
    return new THREE.MeshPhysicalMaterial({
      color: COLORS.dark.muscle,
      roughness: 0.35,
      clearcoat: 0.8,
      clearcoatRoughness: 0.25,
      emissive: new THREE.Color(0x000000),
    });
  }

  private addMuscle(
    group: MuscleGroup,
    parent: THREE.Object3D,
    s: [number, number, number],
    p: [number, number, number],
    rotZ = 0,
    rotX = 0,
  ) {
    const mesh = this.ellipsoid(parent, s, p, this.muscleMat(), rotZ, rotX);
    mesh.userData.muscle = group;
    const list = this.muscles.get(group) ?? [];
    list.push(mesh);
    this.muscles.set(group, list);
    this.pickables.push(mesh);
    return mesh;
  }

  private buildBody() {
    const b = this.body;
    const skin = this.skinMat;

    // Kopf, Hals, Rumpf
    this.ellipsoid(b, [0.095, 0.12, 0.105], [0, 1.665, 0], skin);
    this.capsule(b, 0.05, 0.08, [0, 1.53, 0]);
    this.ellipsoid(b, [0.19, 0.27, 0.12], [0, 1.24, 0], skin);
    this.ellipsoid(b, [0.155, 0.16, 0.105], [0, 1.02, 0], skin);
    this.ellipsoid(b, [0.165, 0.11, 0.11], [0, 0.9, 0], skin);

    // Rumpf-Muskeln
    for (const sx of [-1, 1]) {
      this.addMuscle('chest', b, [0.088, 0.066, 0.042], [sx * 0.076, 1.335, 0.085], sx * -0.12);
      this.addMuscle('shoulders', b, [0.075, 0.072, 0.072], [sx * 0.212, 1.405, 0]);
      this.addMuscle('traps', b, [0.1, 0.045, 0.05], [sx * 0.065, 1.47, -0.035], sx * -0.4);
      this.addMuscle('back', b, [0.092, 0.155, 0.042], [sx * 0.088, 1.24, -0.085], sx * 0.16);
      this.addMuscle('glutes', b, [0.082, 0.082, 0.062], [sx * 0.072, 0.88, -0.068]);
    }
    // Sixpack
    for (const y of [1.19, 1.11, 1.03]) {
      for (const sx of [-1, 1]) {
        this.addMuscle('abs', b, [0.036, 0.034, 0.022], [sx * 0.037, y, y > 1.1 ? 0.103 : 0.098]);
      }
    }

    // Arme (Pivot an der Schulter, leicht abgespreizt)
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.215, 1.41, 0);
      arm.rotation.z = sx * 0.14;
      b.add(arm);
      this.capsule(arm, 0.05, 0.2, [0, -0.17, 0]);
      this.addMuscle('biceps', arm, [0.043, 0.085, 0.04], [0, -0.16, 0.028]);
      this.addMuscle('triceps', arm, [0.044, 0.092, 0.04], [0, -0.16, -0.028]);
      this.capsule(arm, 0.04, 0.2, [0, -0.42, 0]);
      this.addMuscle('forearms', arm, [0.045, 0.09, 0.042], [0, -0.38, 0.004]);
      this.ellipsoid(arm, [0.036, 0.055, 0.022], [0, -0.6, 0], skin);
    }

    // Beine
    for (const sx of [-1, 1]) {
      this.capsule(b, 0.076, 0.3, [sx * 0.09, 0.62, 0], sx * 0.03);
      this.addMuscle('quads', b, [0.072, 0.17, 0.056], [sx * 0.092, 0.64, 0.03], sx * 0.03);
      this.addMuscle('hamstrings', b, [0.066, 0.16, 0.05], [sx * 0.09, 0.63, -0.034], sx * 0.03);
      this.capsule(b, 0.052, 0.28, [sx * 0.095, 0.25, 0]);
      this.addMuscle('calves', b, [0.05, 0.1, 0.05], [sx * 0.095, 0.3, -0.024]);
      this.ellipsoid(b, [0.045, 0.03, 0.1], [sx * 0.095, 0.03, 0.04], skin);
    }
  }

  private addShadow() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(15,203,132,0.45)');
    g.addColorStop(0.5, 'rgba(15,203,132,0.12)');
    g.addColorStop(1, 'rgba(15,203,132,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.001;
    this.scene.add(plane);
  }

  // ------------------------------------------------------------ Farben
  private applyColors() {
    const c = this.dark ? COLORS.dark : COLORS.light;
    const base = new THREE.Color(c.muscle);
    const hot = new THREE.Color(c.heat);
    for (const [group, meshes] of this.muscles) {
      const h = Math.max(0, Math.min(1, this.heat.get(group) ?? 0));
      for (const m of meshes) {
        const mat = m.material as THREE.MeshPhysicalMaterial;
        if (group === this.selected) {
          mat.color.setHex(c.select);
          mat.emissive.setHex(c.select);
        } else {
          mat.color.copy(base).lerp(hot, h > 0 ? 0.3 + h * 0.7 : 0);
          mat.emissive.setHex(group === this.hovered ? 0x2ee39d : 0x000000);
          mat.emissiveIntensity = group === this.hovered ? 0.25 : 0;
        }
        // Nicht ausgewählte Muskeln treten zurück, wenn etwas gewählt ist
        mat.transparent = !!this.selected && group !== this.selected;
        mat.opacity = mat.transparent ? 0.55 : 1;
      }
    }
  }

  // ------------------------------------------------------------ Interaktion
  private bindEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('pointermove', this.onHoverMove);
  }

  private onCancel = () => {
    this.drag = null;
  };

  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const dx = e.clientX - this.drag.x;
    if (Math.abs(dx) > 3 || Math.abs(e.clientY - this.drag.y) > 3) this.drag.moved = true;
    if (this.drag.moved) {
      this.targetRotY += dx * 0.012;
      this.rotY += dx * 0.012;
      this.lastInteraction = performance.now();
    }
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
  };

  private onUp = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const moved = this.drag.moved;
    this.drag = null;
    if (moved) return;
    const hit = this.pick(e);
    this.opts.onSelect(hit === this.selected ? null : hit);
  };

  private onHoverMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || this.drag) return;
    const hit = this.pick(e);
    if (hit !== this.hovered) {
      this.hovered = hit;
      this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      this.applyColors();
      this.opts.onHover?.(hit);
    }
  };

  private pick(e: PointerEvent): MuscleGroup | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    return (hits[0]?.object.userData.muscle as MuscleGroup | undefined) ?? null;
  }

  // ------------------------------------------------------------ Render-Schleife
  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;

    const idle = performance.now() - this.lastInteraction > 2500;
    if (this.autoRotate && !this.drag && idle) this.targetRotY += dt * 0.35;
    this.rotY += (this.targetRotY - this.rotY) * Math.min(1, dt * 5);
    this.body.rotation.y = this.rotY;
    // leichtes "Atmen"
    this.body.position.y = Math.sin(t * 1.6) * 0.006;

    // Kamera fokussiert die ausgewählte Muskelgruppe
    let focusY = 1.0;
    let dist = 4.1;
    if (this.selected) {
      const meshes = this.muscles.get(this.selected) ?? [];
      const v = new THREE.Vector3();
      let y = 0;
      for (const m of meshes) y += m.getWorldPosition(v).y;
      focusY = meshes.length ? y / meshes.length : 1;
      focusY = 0.25 * 1.0 + 0.75 * focusY;
      dist = 3.1;
      const pulse = 0.35 + Math.sin(t * 4) * 0.25;
      for (const m of meshes) (m.material as THREE.MeshPhysicalMaterial).emissiveIntensity = pulse;
    }
    this.camY += (focusY - this.camY) * Math.min(1, dt * 4);
    this.camDist += (dist - this.camDist) * Math.min(1, dt * 4);
    this.camera.position.set(0, this.camY + 0.12, this.camDist);
    this.camera.lookAt(0, this.camY, 0);

    this.renderer.render(this.scene, this.camera);
  };
}
