export function primaryReference(template) {
  const clips = template?.referenceClips || [];
  return (
    clips.find((c) => c.videoUrl && c.source) ||
    clips.find((c) => c.videoUrl) ||
    clips.find((c) => c.source) ||
    null
  );
}
export function referenceGroups(templates) {
  const groups = [
    { id: "local", name: "有原片参考", items: [] },
    { id: "external", name: "有原作链接 · 未导入本地原片", items: [] },
    { id: "empty", name: "暂无参考 · 后续补充配图", items: [] },
  ];
  for (const template of templates) {
    const ref = primaryReference(template);
    groups[ref?.videoUrl ? 0 : ref?.source ? 1 : 2].items.push(template);
  }
  return groups;
}
export function assignOriginal(plan, id) {
  plan.mapping = "common";
  plan.imageIds = id ? [id] : [];
  plan.rows = [];
  plan.shotImages = [];
  plan.promptsDirty = !!plan.prompts?.length;
}
export function projectImageIds(project) {
  return [
    ...new Set(
      [
        ...(project.materials?.sceneImageIds || []),
        project.commonImageId,
        ...project.plans.flatMap((p) => p.imageIds || []),
      ].filter(Boolean),
    ),
  ];
}
export function imageReady(plan, assets) {
  const ids =
    plan.mapping === "common"
      ? Array(plan.count).fill(plan.imageIds?.[0])
      : Array.from({ length: plan.count }, (_, i) => plan.imageIds?.[i]);
  return ids.every(
    (id) => id && assets.some((a) => a.id === id && !a.archived && a.confirmed !== false),
  );
}
