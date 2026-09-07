export type FloorDirection = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export type NavigableTable = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function center(table: NavigableTable) {
  return {
    x: table.x + table.width / 2,
    y: table.y + table.height / 2,
  };
}

function firstTable(tables: NavigableTable[]) {
  return [...tables].sort((left, right) => {
    const leftCenter = center(left);
    const rightCenter = center(right);
    return leftCenter.y - rightCenter.y || leftCenter.x - rightCenter.x;
  })[0] ?? null;
}

export function findDirectionalTable(tables: NavigableTable[], currentId: string, direction: FloorDirection) {
  if (tables.length === 0) return null;

  const current = tables.find((table) => table.id === currentId);
  if (!current) return firstTable(tables);

  const currentCenter = center(current);
  const candidates = tables.flatMap((table) => {
    if (table.id === current.id) return [];

    const tableCenter = center(table);
    const deltaX = tableCenter.x - currentCenter.x;
    const deltaY = tableCenter.y - currentCenter.y;
    const isCandidate =
      (direction === "ArrowLeft" && deltaX < 0) ||
      (direction === "ArrowRight" && deltaX > 0) ||
      (direction === "ArrowUp" && deltaY < 0) ||
      (direction === "ArrowDown" && deltaY > 0);

    if (!isCandidate) return [];

    const primaryDistance = direction === "ArrowLeft" || direction === "ArrowRight" ? Math.abs(deltaX) : Math.abs(deltaY);
    const perpendicularDistance = direction === "ArrowLeft" || direction === "ArrowRight" ? Math.abs(deltaY) : Math.abs(deltaX);
    return [{ table, score: primaryDistance + perpendicularDistance * 2 }];
  });

  candidates.sort((left, right) => left.score - right.score);
  return candidates[0]?.table ?? current;
}
