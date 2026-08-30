export function currentFocusNodes<T extends { id: string }>(
  nodes: readonly T[],
  status: ReadonlyMap<string, string>,
  progressByNode: Readonly<Record<string, number>>,
  recommendedId: string | null,
): T[] {
  // Centre one concrete objective. Framing several distant active branches can
  // put their midpoint over empty canvas, which looks like the chart vanished.
  let inProgress: T | undefined;
  let bestProgress = 0;
  for (const node of nodes) {
    const progress = progressByNode[node.id] ?? 0;
    if (status.get(node.id) === 'available' && progress > bestProgress) {
      inProgress = node;
      bestProgress = progress;
    }
  }
  if (inProgress) return [inProgress];
  const recommended = recommendedId
    ? nodes.find((node) => node.id === recommendedId)
    : undefined;
  return recommended ? [recommended] : [];
}
