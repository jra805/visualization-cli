/**
 * Squarified treemap layout algorithm (Bruls-Huizing-van Wijk).
 * Produces rectangles that fill the container with minimal aspect ratio deviation.
 */

export interface TreemapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TreemapItem {
  id: string;
  value: number; // area weight (e.g., LOC)
  rect: TreemapRect;
}

/**
 * Lay out items into a container using the squarified algorithm.
 * Items must have positive values. Returns items with .rect populated.
 */
export function squarify(
  items: { id: string; value: number }[],
  container: TreemapRect
): TreemapItem[] {
  if (items.length === 0) return [];

  // Sort descending by value
  const sorted = items
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  if (sorted.length === 0) return [];

  const totalValue = sorted.reduce((sum, item) => sum + item.value, 0);
  const results: TreemapItem[] = [];

  layoutRow(sorted, container, totalValue, results);

  return results;
}

function layoutRow(
  items: { id: string; value: number }[],
  container: TreemapRect,
  totalValue: number,
  results: TreemapItem[]
): void {
  if (items.length === 0 || container.w <= 0 || container.h <= 0) return;

  if (items.length === 1) {
    results.push({ id: items[0].id, value: items[0].value, rect: { ...container } });
    return;
  }

  const totalArea = container.w * container.h;

  // Determine which side is shorter
  const isWide = container.w >= container.h;
  const shortSide = isWide ? container.h : container.w;

  // Greedily add items to current row while aspect ratio improves
  let row: { id: string; value: number }[] = [];
  let rowValue = 0;
  let bestWorst = Infinity;
  let splitIdx = 0;

  for (let i = 0; i < items.length; i++) {
    const candidate = [...row, items[i]];
    const candidateValue = rowValue + items[i].value;
    const candidateArea = (candidateValue / totalValue) * totalArea;
    const rowLength = candidateArea / shortSide;

    // Compute worst aspect ratio in this candidate row
    let worst = 0;
    for (const item of candidate) {
      const itemArea = (item.value / totalValue) * totalArea;
      const itemLength = itemArea / rowLength;
      const ar = Math.max(rowLength / itemLength, itemLength / rowLength);
      worst = Math.max(worst, ar);
    }

    if (worst <= bestWorst) {
      bestWorst = worst;
      row = candidate;
      rowValue = candidateValue;
      splitIdx = i + 1;
    } else {
      break;
    }
  }

  // Layout the chosen row
  const rowArea = (rowValue / totalValue) * totalArea;
  const rowThickness = rowArea / shortSide;

  let offset = 0;
  for (const item of row) {
    const itemArea = (item.value / totalValue) * totalArea;
    const itemLength = itemArea / rowThickness;

    if (isWide) {
      results.push({
        id: item.id,
        value: item.value,
        rect: {
          x: container.x,
          y: container.y + offset,
          w: rowThickness,
          h: itemLength,
        },
      });
    } else {
      results.push({
        id: item.id,
        value: item.value,
        rect: {
          x: container.x + offset,
          y: container.y,
          w: itemLength,
          h: rowThickness,
        },
      });
    }
    offset += itemLength;
  }

  // Recurse on remaining items in the remaining space
  const remaining = items.slice(splitIdx);
  if (remaining.length > 0) {
    const newContainer: TreemapRect = isWide
      ? {
          x: container.x + rowThickness,
          y: container.y,
          w: container.w - rowThickness,
          h: container.h,
        }
      : {
          x: container.x,
          y: container.y + rowThickness,
          w: container.w,
          h: container.h - rowThickness,
        };

    layoutRow(remaining, newContainer, totalValue, results);
  }
}
