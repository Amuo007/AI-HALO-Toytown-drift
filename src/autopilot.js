export function createAutopilot(waypoints) {
  let idx = 0;
  return function step(state) {
    for (let guard = 0; guard < waypoints.length; guard++) {
      const [wx, wz] = waypoints[idx];
      const dx = wx - state.x, dz = wz - state.z;
      if (dx * dx + dz * dz > 64) break;
      idx = (idx + 1) % waypoints.length;
    }
    const [tx, tz] = waypoints[idx];
    let err = Math.atan2(tx - state.x, tz - state.z) - state.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    const speed = Math.abs(state.speed);
    return {
      steer: Math.max(-1, Math.min(1, err * 2.2)),
      throttle: Math.abs(err) > 0.35 && speed > 9 ? 0.2 : 0.85,
      handbrake: Math.abs(err) > 0.9 && speed > 16,
    };
  };
}
