export function currentFocusNodes<T extends { id: string }>(
  nodes: readonly T[],
  status: ReadonlyMap<string, string>,
  progressByNode: Readonly<Record<string, number>>,
  recommendedId: string | null,
): T[] {
  const inProgress = nodes.filter(
    (node) => status.get(node.id) === 'available' && (progressByNode[node.id] ?? 0) > 0,
  );
  if (inProgress.length > 0) return inProgress;
  const recommended = recommendedId
    ? nodes.find((node) => node.id === recommendedId)
    : undefined;
  return recommended ? [recommended] : [];
}
