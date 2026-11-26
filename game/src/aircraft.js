// The bush courier: a high-wing single-prop plane built from primitives, in
// Garuda orange and white. buildAircraft returns the group plus the propeller
// so the main loop can spin it, and a small nav-light pair.
// Three.js r160 loads as a classic script in index.html; modules read the
// global it sets (a UMD build has no ES exports to import).
const THREE = globalThis.THREE;

export function buildAircraft() {
  const plane = new THREE.Group();
  plane.name = 'courier';

  const orange = new THREE.MeshLambertMaterial({ color: 0xe8590c });
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f1e8 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd8e8 });

  // Fuselage: tapered cylinder nose-to-tail.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.55, 7.2, 12), orange);
  body.rotation.x = Math.PI / 2;
  body.position.z = 0.4;
  plane.add(body);
  // Nose cowling + spinner.
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.06, 1.1, 12), dark);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -3.6;
  plane.add(nose);
  // Cabin windows.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 2.2), glass);
  cabin.position.set(0, 0.75, -0.6);
  plane.add(cabin);
  // High wing with a white stripe.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.28, 2.4), white);
  wing.position.set(0, 0.95, -0.4);
  plane.add(wing);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.3, 0.5), orange);
  stripe.position.set(0, 0.95, -1.3);
  plane.add(stripe);
  // Wing struts.
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6), dark);
    strut.position.set(side * 2.6, -0.15, -0.4);
    strut.rotation.z = side * 0.5;
    plane.add(strut);
  }
  // Tail: horizontal stabiliser + vertical fin with the Garuda "G".
  const tail = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 1.5), white);
  tail.position.set(0, 0.35, 3.9);
  plane.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.2, 1.8), orange);
  fin.position.set(0, 1.2, 3.9);
  plane.add(fin);
  // Fixed landing gear: two wheels on struts.
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 6), dark);
    leg.position.set(side * 1.1, -1.15, -0.8);
    plane.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.1, -1.85, -0.8);
    plane.add(wheel);
  }
  // Propeller: hub + two blades, spun by the main loop.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), dark);
  prop.add(hub);
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.4, 0.12), dark);
    blade.rotation.z = angle;
    blade.position.y = 0;
    prop.add(blade);
  }
  prop.position.set(0, 0, -4.25);
  plane.add(prop);
  // Nav lights: red left, green right, white tail.
  const lightMat = (c) => new THREE.MeshBasicMaterial({ color: c });
  const leftLight = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lightMat(0xff2222));
  leftLight.position.set(-6.8, 0.95, -0.4);
  const rightLight = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lightMat(0x22ff66));
  rightLight.position.set(6.8, 0.95, -0.4);
  const tailLight = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), lightMat(0xffffff));
  tailLight.position.set(0, 0.5, 4.4);
  plane.add(leftLight, rightLight, tailLight);

  plane.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = false;
  });
  return { group: plane, prop };
}
