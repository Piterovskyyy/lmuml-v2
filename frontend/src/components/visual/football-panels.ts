type Vector = readonly [number, number, number];
type Face = readonly [number, number, number];
type Arc = { start: Vector; end: Vector };
type PanelPath = { id: string; d: string };

const radius = 500;
const goldenRatio = (1 + Math.sqrt(5)) / 2;

function dot(a: Vector, b: Vector): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vector, b: Vector): Vector {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit([x, y, z]: Vector): Vector {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

function sphericalPoint(a: Vector, b: Vector, position: number): Vector {
  return unit([
    a[0] + (b[0] - a[0]) * position,
    a[1] + (b[1] - a[1]) * position,
    a[2] + (b[2] - a[2]) * position,
  ]);
}

const vertices = [-1, 1].flatMap((a) =>
  [-goldenRatio, goldenRatio].flatMap((b) => [unit([0, a, b]), unit([a, b, 0]), unit([b, 0, a])]),
);

function icosahedronFaces(): Face[] {
  const faces: Face[] = [];
  for (let a = 0; a < vertices.length; a++) {
    for (let b = a + 1; b < vertices.length; b++) {
      if (dot(vertices[a], vertices[b]) <= 0) continue;
      for (let c = b + 1; c < vertices.length; c++) {
        if (dot(vertices[a], vertices[c]) > 0 && dot(vertices[b], vertices[c]) > 0) {
          faces.push([a, b, c]);
        }
      }
    }
  }
  return faces;
}

function faceNormal(a: Vector, b: Vector, c: Vector): Vector {
  return unit([a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]]);
}

function tangent(direction: Vector, normal: Vector): Vector {
  return unit(cross(normal, cross(direction, normal)));
}

function valley(normal: Vector, corner: Vector, depth: number): Vector {
  const direction = tangent(corner, normal);
  const spread = Math.sqrt(1 - depth * depth);
  return [
    depth * normal[0] + spread * direction[0],
    depth * normal[1] + spread * direction[1],
    depth * normal[2] + spread * direction[2],
  ];
}

function panelGeometry() {
  const starCorners = vertices.map(() => new Set<Vector>());
  const sharedTips = new Map<string, Vector>();

  function tip(a: number, b: number): Vector {
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    const existing = sharedTips.get(key);
    if (existing) return existing;
    const point = sphericalPoint(vertices[a], vertices[b], 0.5);
    sharedTips.set(key, point);
    starCorners[a].add(point);
    starCorners[b].add(point);
    return point;
  }

  const faces = icosahedronFaces();
  const hexagons = faces.map(([a, b, c]) => {
    const normal = faceNormal(vertices[a], vertices[b], vertices[c]);
    const ab = tip(a, b);
    const bc = tip(b, c);
    const ca = tip(c, a);
    // The three tips and three valleys lie at the same angular radius from the face centre.
    const depth = dot(normal, ab);
    const corners = [a, b, c].map((index) => {
      const point = valley(normal, vertices[index], depth);
      starCorners[index].add(point);
      return point;
    });
    return [corners[0], ab, corners[1], bc, corners[2], ca];
  });

  const stars = starCorners.map((corners, index) => {
    const points = [...corners];
    const centre = vertices[index];
    const axis = tangent(points[0], centre);
    const perpendicular = cross(centre, axis);
    const angle = (point: Vector) => Math.atan2(dot(point, perpendicular), dot(point, axis));
    return points.sort((a, b) => angle(a) - angle(b));
  });

  const [a, b, c] = faces[0];
  const front = faceNormal(vertices[a], vertices[b], vertices[c]);
  const up = tangent(vertices[a], front);
  const right = cross(up, front);
  const project = (point: Vector): Vector => [
    dot(point, right),
    -dot(point, up),
    dot(point, front),
  ];

  return {
    stars: stars.map((points) => points.map(project)),
    hexagons: hexagons.map((points) => points.map(project)),
  };
}

function visibleArc(start: Vector, end: Vector): Arc | undefined {
  if (start[2] < 0 && end[2] < 0) return;
  if (start[2] >= 0 && end[2] >= 0) return { start, end };
  const horizon = sphericalPoint(start, end, start[2] / (start[2] - end[2]));
  return start[2] < 0 ? { start: horizon, end } : { start, end: horizon };
}

function projectedPoint([x, y]: Vector): string {
  return `${(radius * (1 + x)).toFixed(2)} ${(radius * (1 + y)).toFixed(2)}`;
}

function arcLine({ start, end }: Arc): string {
  const steps = 6;
  return Array.from({ length: steps }, (_, index) => {
    const point = sphericalPoint(start, end, (index + 1) / steps);
    return `L${projectedPoint(point)}`;
  }).join("");
}

function limbArc(start: Vector, end: Vector): string {
  const sweep = start[0] * end[1] - start[1] * end[0] >= 0 ? 1 : 0;
  return `A${radius} ${radius} 0 0 ${sweep} ${projectedPoint(end)}`;
}

function paths(panels: Vector[][], prefix: string, close: boolean): PanelPath[] {
  return panels.flatMap((corners, index) => {
    const arcs = corners.flatMap((point, corner) => {
      const arc = visibleArc(point, corners[(corner + 1) % corners.length]);
      return arc ? [arc] : [];
    });
    if (!arcs.length) return [];
    const first = arcs[0].start;
    let previous = first;
    let d = `M${projectedPoint(first)}`;
    for (const arc of arcs) {
      if (projectedPoint(previous) !== projectedPoint(arc.start)) {
        d += close ? limbArc(previous, arc.start) : `M${projectedPoint(arc.start)}`;
      }
      d += arcLine(arc);
      previous = arc.end;
    }
    if (close) {
      if (projectedPoint(previous) !== projectedPoint(first)) d += limbArc(previous, first);
      d += "Z";
    }
    return [{ id: `${prefix}-${index}`, d }];
  });
}

const panels = panelGeometry();

export const footballPanelPattern = {
  stars: paths(panels.stars, "star", true),
  hexagons: paths(panels.hexagons, "hexagon", true),
  // Every interior seam borders one hexagon. Drawing its visible arcs once avoids double strokes.
  seams: paths(panels.hexagons, "seam", false),
};
